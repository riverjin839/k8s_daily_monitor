"""클러스터 컴포넌트 버전 / 파라미터 수집 + 히스토리 관리.

수집하는 범위 (kubeconfig 만으로 가능한 것):
- K8s server (apiserver version)
- 각 노드의 kubelet / kube-proxy / container-runtime / kernel / OS 버전
- kube-system 의 core component (apiserver, controller-manager, scheduler,
  kube-proxy, coredns, etcd) — image tag + command/args 플래그
- cilium-agent / cilium-operator — image tag + args
- cilium-config ConfigMap — data 전체

SSH 가 필요한 NIC/호스트 파라미터는 여기서 수집하지 않음.
"""
import hashlib
import json
import os
import re
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from kubernetes import client as k8s_client, config as k8s_config
from kubernetes.client import ApiException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster, ClusterConfigSnapshot
from app.services.kubeconfig import ensure_kubeconfig_file as _ensure_kubeconfig_file_for
from app.services.ssh_runner import SSHTarget, _exec_ssh  # noqa: PLC2701 — 내부 재사용

router = APIRouter(prefix="/clusters", tags=["versions"])

_K8S_TIMEOUT = 10


# ── helpers ──────────────────────────────────────────────────────────────────


def _hash_payload(component: str, version: str | None, data: dict) -> str:
    blob = json.dumps(
        {"component": component, "version": version, "data": data},
        sort_keys=True, default=str,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _parse_container_args(container) -> dict[str, str]:
    """container.command + args 에서 --flag=value / --flag value 를 dict 로."""
    tokens: list[str] = []
    if container.command:
        tokens.extend(container.command)
    if container.args:
        tokens.extend(container.args)
    out: dict[str, str] = {}
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok.startswith("--"):
            if "=" in tok:
                k, v = tok[2:].split("=", 1)
                out[k] = v
            else:
                key = tok[2:]
                if i + 1 < len(tokens) and not tokens[i + 1].startswith("--"):
                    out[key] = tokens[i + 1]
                    i += 1
                else:
                    out[key] = "true"
        i += 1
    return out


def _image_tag(image: str) -> str:
    """registry.io/ns/name:tag → tag. 없으면 'latest'."""
    # 포트 콜론 분리 대비: 마지막 '/' 뒤에서 확인
    last = image.rsplit("/", 1)[-1]
    if ":" in last:
        return last.rsplit(":", 1)[1]
    return "latest"


def _store_if_changed(
    db: Session,
    cluster_id: UUID,
    component: str,
    category: str,
    version: str | None,
    data: dict,
    now: datetime,
) -> bool:
    """마지막 스냅샷과 hash 가 다르면 새로 insert. 반환값은 변경 여부."""
    h = _hash_payload(component, version, data)
    last = (
        db.query(ClusterConfigSnapshot)
        .filter(ClusterConfigSnapshot.cluster_id == cluster_id,
                ClusterConfigSnapshot.component == component)
        .order_by(ClusterConfigSnapshot.collected_at.desc())
        .first()
    )
    if last and last.content_hash == h:
        return False
    snap = ClusterConfigSnapshot(
        cluster_id=cluster_id,
        component=component,
        category=category,
        version=version,
        data=data,
        content_hash=h,
        collected_at=now,
    )
    db.add(snap)
    return True


# ── 수집 로직 ────────────────────────────────────────────────────────────────

def _collect_all(cluster: Cluster, kc_path: str, db: Session) -> dict:
    """실제 수집 수행. 반환은 요약(각 카테고리별 변경 개수)."""
    api_client = k8s_config.new_client_from_config(config_file=kc_path)
    v1 = k8s_client.CoreV1Api(api_client)
    version_api = k8s_client.VersionApi(api_client)

    now = datetime.utcnow()
    changed = 0
    errors: list[str] = []

    # 1. K8s server version
    try:
        info = version_api.get_code(_request_timeout=_K8S_TIMEOUT)
        if _store_if_changed(db, cluster.id, "k8s_server", "control_plane",
                             info.git_version, {
                                 "major": info.major,
                                 "minor": info.minor,
                                 "platform": info.platform,
                                 "buildDate": info.build_date,
                                 "goVersion": info.go_version,
                             }, now):
            changed += 1
    except Exception as e:
        errors.append(f"k8s_server: {str(e)[:120]}")

    # 2. Nodes — kubelet, kube-proxy (container-runtime, kernel, os)
    try:
        nodes = v1.list_node(_request_timeout=_K8S_TIMEOUT)
        for node in nodes.items:
            ni = node.status.node_info
            name = node.metadata.name
            data = {
                "kubeletVersion":         getattr(ni, "kubelet_version", None),
                "kubeProxyVersion":       getattr(ni, "kube_proxy_version", None),
                "containerRuntime":       getattr(ni, "container_runtime_version", None),
                "kernelVersion":          getattr(ni, "kernel_version", None),
                "osImage":                getattr(ni, "os_image", None),
                "operatingSystem":        getattr(ni, "operating_system", None),
                "architecture":           getattr(ni, "architecture", None),
            }
            if _store_if_changed(db, cluster.id, f"kubelet:{name}", "kubelet",
                                 data.get("kubeletVersion"), data, now):
                changed += 1
    except Exception as e:
        errors.append(f"nodes: {str(e)[:120]}")

    # 3. kube-system core components — image tag + flags
    CORE_COMPONENTS = [
        ("kube-apiserver",          "kube_apiserver",          "control_plane"),
        ("kube-controller-manager", "kube_controller_manager", "control_plane"),
        ("kube-scheduler",          "kube_scheduler",          "control_plane"),
        ("kube-proxy",              "kube_proxy",              "control_plane"),
        ("coredns",                 "coredns",                 "control_plane"),
        ("etcd",                    "etcd",                    "control_plane"),
    ]

    try:
        sys_pods = v1.list_namespaced_pod("kube-system", _request_timeout=_K8S_TIMEOUT)
    except Exception as e:
        sys_pods = None
        errors.append(f"kube-system pods: {str(e)[:120]}")

    if sys_pods is not None:
        for prefix, comp_key, category in CORE_COMPONENTS:
            # 각 컴포넌트의 첫 pod 하나만 대표로 (모든 replica 거의 동일)
            pod = next(
                (p for p in sys_pods.items
                 if p.metadata.name.startswith(prefix) and p.spec and p.spec.containers),
                None,
            )
            if not pod:
                continue
            main = pod.spec.containers[0]
            data = {
                "image": main.image,
                "flags": _parse_container_args(main),
                "podName": pod.metadata.name,
            }
            version = _image_tag(main.image)
            _store_if_changed(db, cluster.id, comp_key, category, version, data, now) and (changed := changed + 1)

        # 4. Cilium — agent + operator (kube-system, labels k8s-app 또는 app.kubernetes.io/name)
        for label_key, label_val, comp_key in [
            ("k8s-app", "cilium",          "cilium_agent"),
            ("io.cilium/app", "operator",  "cilium_operator"),
            ("name", "cilium-operator",    "cilium_operator"),
        ]:
            # 이미 cilium_operator 가 채워졌으면 건너뛰기
            pod = next(
                (p for p in sys_pods.items
                 if (p.metadata.labels or {}).get(label_key) == label_val and p.spec and p.spec.containers),
                None,
            )
            if not pod:
                continue
            main = pod.spec.containers[0]
            data = {
                "image": main.image,
                "flags": _parse_container_args(main),
                "podName": pod.metadata.name,
                "namespace": pod.metadata.namespace,
            }
            version = _image_tag(main.image)
            if _store_if_changed(db, cluster.id, comp_key, "cni", version, data, now):
                changed += 1

    # 5. cilium-config ConfigMap
    try:
        cm = v1.read_namespaced_config_map("cilium-config", "kube-system",
                                           _request_timeout=_K8S_TIMEOUT)
        data = {"data": dict(cm.data or {})}
        version = (cm.data or {}).get("cilium-version") or (cm.data or {}).get("cni-version")
        if _store_if_changed(db, cluster.id, "cilium_config", "cni", version, data, now):
            changed += 1
    except ApiException as e:
        if e.status != 404:
            errors.append(f"cilium-config: HTTP {e.status}")
    except Exception as e:
        errors.append(f"cilium-config: {str(e)[:120]}")

    db.commit()
    return {"changed": changed, "errors": errors, "collectedAt": now.isoformat()}


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/{cluster_id}/collect-versions")
def collect_versions(cluster_id: UUID, db: Session = Depends(get_db)):
    """kubeconfig 를 이용해 현재 버전/설정 스냅샷을 수집. 변경된 항목만 저장."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    kc_path = _ensure_kubeconfig_file_for(cluster)
    if not kc_path or not os.path.exists(kc_path):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="kubeconfig가 없습니다. 먼저 kubeconfig를 등록하세요.",
        )

    try:
        summary = _collect_all(cluster, kc_path, db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"수집 실패: {str(e)[:200]}",
        )
    return {"cluster_id": str(cluster_id), **summary}


# ── etcd (systemd) 수집 ──────────────────────────────────────────────────────

class EtcdSystemdCollectRequest(BaseModel):
    """사내 kubeadm 외 환경에서 etcd 가 systemd 로 기동될 때, 각 master 노드에
    SSH 로 접속해 `systemctl show etcd` + `etcd --version` + 필요 시
    `etcdctl endpoint health` 결과를 모아 1건의 스냅샷으로 저장한다.
    자격증명은 요청에만 존재하고 DB 에 저장하지 않는다.
    """
    hosts: list[str] = Field(..., min_length=1, max_length=30)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(default="root", min_length=1, max_length=64)
    password: str | None = None
    private_key: str | None = None
    use_sudo: bool = True
    connect_timeout: int = Field(default=8, ge=1, le=60)
    unit: str = Field(default="etcd", max_length=64)


_SYSTEMCTL_SHOW_PROPS = [
    "ActiveState", "SubState", "MainPID", "FragmentPath", "ExecStart",
    "UnitFileState", "LoadState",
]


def _parse_systemctl_show(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _parse_etcd_version(text: str) -> str | None:
    # `etcd Version: 3.5.12` 또는 `etcdctl version: 3.5.12`
    m = re.search(r"Version:\s*([0-9][^\s]+)", text)
    return m.group(1) if m else None


def _clean_exec_start(val: str) -> str:
    """systemctl show 의 ExecStart 는 전체 구조체 문자열. argv[...] 부분 추출."""
    m = re.search(r"argv\[\]=([^;]*);", val)
    if m:
        return m.group(1).strip()
    return val.strip()


@router.post("/{cluster_id}/collect-etcd-systemd")
def collect_etcd_systemd(
    cluster_id: UUID,
    payload: EtcdSystemdCollectRequest,
    db: Session = Depends(get_db),
):
    """SSH 로 각 master 노드의 etcd (systemd unit) 상태/버전을 수집해 스냅샷에 저장.

    수집 항목(호스트별):
      - systemctl show etcd → ActiveState / MainPID / FragmentPath / ExecStart / UnitFileState
      - etcd --version → 버전 문자열
    모든 호스트를 합쳐 component 키 `etcd_systemd` 로 1건의 스냅샷(JSON) 을 저장.
    변경이 없으면 저장하지 않는다.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    if not payload.password and not payload.private_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password 또는 private_key 중 하나는 필수입니다.",
        )

    now = datetime.utcnow()
    sudo = "sudo -n " if payload.use_sudo else ""
    show_cmd = f"{sudo}systemctl show {payload.unit} -p {',-p '.join(_SYSTEMCTL_SHOW_PROPS)}"
    ver_cmd = f"{sudo}etcd --version 2>/dev/null | head -2"

    per_host: list[dict] = []
    errors: list[str] = []

    for host in payload.hosts:
        target = SSHTarget(
            host=host, port=payload.port, username=payload.username,
            password=payload.password, private_key=payload.private_key,
        )
        r_show = _exec_ssh(target, show_cmd, connect_timeout=payload.connect_timeout, exec_timeout=15)
        r_ver  = _exec_ssh(target, ver_cmd,  connect_timeout=payload.connect_timeout, exec_timeout=10)

        host_entry: dict = {"host": host, "status": r_show.status}

        if r_show.status != "ok":
            host_entry["error"] = r_show.error or r_show.stderr[:200]
            errors.append(f"{host}: {r_show.error or r_show.status}")
            per_host.append(host_entry)
            continue

        props = _parse_systemctl_show(r_show.stdout)
        host_entry["active_state"]  = props.get("ActiveState")
        host_entry["sub_state"]     = props.get("SubState")
        host_entry["unit_file_state"] = props.get("UnitFileState")
        host_entry["main_pid"]      = int(props["MainPID"]) if props.get("MainPID", "").isdigit() else None
        host_entry["fragment_path"] = props.get("FragmentPath")
        host_entry["exec_start"]    = _clean_exec_start(props.get("ExecStart", ""))
        host_entry["raw"]           = props
        if r_ver.status == "ok":
            host_entry["version"] = _parse_etcd_version(r_ver.stdout)
        per_host.append(host_entry)

    # 대표 버전 — 모든 호스트의 버전이 동일하면 그걸, 다르면 ';' 구분
    versions = sorted({(h.get("version") or "").strip() for h in per_host if h.get("version")})
    version_label: str | None
    if len(versions) == 1:
        version_label = versions[0]
    elif len(versions) > 1:
        version_label = ";".join(versions)
    else:
        version_label = None

    snapshot_data = {
        "source": "systemd",
        "unit": payload.unit,
        "hosts": per_host,
        "collected_at": now.isoformat(),
    }

    changed = _store_if_changed(
        db, cluster_id,
        component="etcd_systemd",
        category="control_plane",
        version=version_label,
        data=snapshot_data,
        now=now,
    )
    if changed:
        db.commit()

    return {
        "cluster_id": str(cluster_id),
        "stored": changed,
        "changed": 1 if changed else 0,
        "hosts": per_host,
        "component_key": "etcd_systemd",
        "errors": errors,
    }


# ── kernel params 수집 ───────────────────────────────────────────────────────

class KernelParamsCollectRequest(BaseModel):
    """각 노드에 SSH 로 접속해 sysctl 결과를 수집해 스냅샷 저장. 각 노드별로
    `kernel_params:{host}` component 키로 저장, 내용 해시가 이전과 같으면
    저장 생략 (최신 일자 기준 uniq).
    """
    hosts: list[str] = Field(..., min_length=1, max_length=200)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(default="root", min_length=1, max_length=64)
    password: str | None = None
    private_key: str | None = None
    use_sudo: bool = False
    connect_timeout: int = Field(default=8, ge=1, le=60)
    # 수집 대상. 비어있으면 아래 기본 prefix 들만 긁는다.
    params: list[str] = Field(default_factory=list, max_length=200)
    # 비어있을 때 사용할 prefix 목록
    default_prefixes: list[str] = Field(default_factory=lambda: [
        "net.ipv4", "net.bridge", "net.core", "vm",
        "fs.file-max", "fs.nr_open", "kernel.pid_max",
    ])


def _parse_sysctl(text: str) -> dict[str, str]:
    """`key = value\\nkey2 = value2` → dict. 파이프라인 출력 안정화를 위해
    '=' 공백 변형까지 허용."""
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


@router.post("/{cluster_id}/collect-kernel-params")
def collect_kernel_params(
    cluster_id: UUID,
    payload: KernelParamsCollectRequest,
    db: Session = Depends(get_db),
):
    """노드별 sysctl 값을 수집해 히스토리에 누적. 내용 동일시 저장 생략."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    if not payload.password and not payload.private_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password 또는 private_key 중 하나는 필수입니다.",
        )

    now = datetime.utcnow()
    sudo = "sudo -n " if payload.use_sudo else ""
    # params 가 있으면 해당 키만, 없으면 prefix 매칭 (`sysctl -a | grep -E ...`)
    if payload.params:
        # 안전: 사용자 입력은 shell 해석되지 않도록 per-key 호출
        cmds = " && ".join([
            f"{sudo}sysctl -n {p!r} 2>/dev/null | sed 's#^#{p} = #'"
            for p in payload.params if re.match(r"^[A-Za-z0-9_.-]+$", p)
        ])
        cmd = cmds
    else:
        # prefix 필터 — `net.ipv4.` / `fs.` / `vm.` 등으로 시작하는 줄만
        grep_expr = "|".join(re.escape(p) + r"\\." for p in payload.default_prefixes if "." not in p)
        exact_expr = "|".join(re.escape(p) for p in payload.default_prefixes if "." in p)
        parts = [e for e in (grep_expr, exact_expr) if e]
        regex = "|".join(parts) if parts else "."
        cmd = f"{sudo}sysctl -a 2>/dev/null | grep -E '^({regex})' || true"

    changed = 0
    per_host: list[dict] = []
    errors: list[str] = []

    for host in payload.hosts:
        target = SSHTarget(
            host=host, port=payload.port, username=payload.username,
            password=payload.password, private_key=payload.private_key,
        )
        res = _exec_ssh(target, cmd, connect_timeout=payload.connect_timeout, exec_timeout=20)
        entry: dict = {"host": host, "status": res.status}
        if res.status != "ok":
            entry["error"] = res.error or res.stderr[:200]
            errors.append(f"{host}: {res.error or res.status}")
            per_host.append(entry)
            continue
        parsed = _parse_sysctl(res.stdout)
        entry["param_count"] = len(parsed)
        data = {"host": host, "params": parsed, "collected_at": now.isoformat()}
        stored = _store_if_changed(
            db, cluster_id,
            component=f"kernel_params:{host}",
            category="kernel",
            version=None,
            data=data,
            now=now,
        )
        entry["stored"] = stored
        if stored:
            changed += 1
        per_host.append(entry)

    if changed:
        db.commit()

    return {
        "cluster_id": str(cluster_id),
        "changed": changed,
        "hosts": per_host,
        "errors": errors,
    }


# ── etcdctl config 수집 ─────────────────────────────────────────────────────

class EtcdctlConfigCollectRequest(BaseModel):
    """etcd 가 systemd 로 동작 중일 때 `/etc/etcd.env` 등 설정 파일과 endpoint
    status 를 수집해 스냅샷 저장. 내용 해시 기준 dedup.
    """
    hosts: list[str] = Field(..., min_length=1, max_length=30)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(default="root", min_length=1, max_length=64)
    password: str | None = None
    private_key: str | None = None
    use_sudo: bool = True
    connect_timeout: int = Field(default=8, ge=1, le=60)
    # 읽을 설정파일 후보 (첫 존재하는 것 사용)
    env_files: list[str] = Field(default_factory=lambda: [
        "/etc/etcd.env", "/etc/default/etcd", "/etc/sysconfig/etcd",
    ])
    # etcdctl endpoint status 호출 여부
    query_endpoint_status: bool = True
    etcdctl_path: str = Field(default="etcdctl", max_length=256)
    # endpoint status 에 사용할 환경변수 파일 (ETCDCTL_CACERT 등). 비어있으면 env_files 사용.
    source_env_file: str | None = None


@router.post("/{cluster_id}/collect-etcdctl-config")
def collect_etcdctl_config(
    cluster_id: UUID,
    payload: EtcdctlConfigCollectRequest,
    db: Session = Depends(get_db),
):
    """etcd 설정 (env 파일 + endpoint status) 을 수집해 histor 에 누적. dedup."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    if not payload.password and not payload.private_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password 또는 private_key 중 하나는 필수입니다.",
        )

    now = datetime.utcnow()
    sudo = "sudo -n " if payload.use_sudo else ""

    changed = 0
    per_host: list[dict] = []
    errors: list[str] = []

    for host in payload.hosts:
        target = SSHTarget(
            host=host, port=payload.port, username=payload.username,
            password=payload.password, private_key=payload.private_key,
        )
        # 1) 설정파일 내용
        env_content: str | None = None
        env_file_used: str | None = None
        for candidate in payload.env_files:
            # 경로 검증 — shell 메타문자 금지
            if not re.match(r"^[A-Za-z0-9_./-]+$", candidate):
                continue
            check = _exec_ssh(
                target,
                f"{sudo}test -f {candidate} && {sudo}cat {candidate} 2>/dev/null || true",
                connect_timeout=payload.connect_timeout, exec_timeout=8,
            )
            if check.status == "ok" and check.stdout.strip():
                env_content = check.stdout
                env_file_used = candidate
                break

        # 2) endpoint status (JSON)
        endpoint_status: str | None = None
        if payload.query_endpoint_status:
            src = payload.source_env_file or env_file_used
            src_expr = f"set -a; . {src}; set +a; " if src and re.match(r"^[A-Za-z0-9_./-]+$", src) else ""
            safe_etcdctl = payload.etcdctl_path if re.match(r"^[A-Za-z0-9_./-]+$", payload.etcdctl_path) else "etcdctl"
            r = _exec_ssh(
                target,
                f"{sudo}bash -c '{src_expr}{safe_etcdctl} endpoint status -w json 2>/dev/null'",
                connect_timeout=payload.connect_timeout, exec_timeout=15,
            )
            if r.status == "ok":
                endpoint_status = r.stdout.strip()

        entry: dict = {
            "host": host,
            "env_file": env_file_used,
            "has_endpoint_status": bool(endpoint_status),
        }

        if env_content is None and endpoint_status is None:
            entry["error"] = "env 파일/endpoint status 모두 읽지 못함"
            errors.append(f"{host}: 데이터 없음")
            per_host.append(entry)
            continue

        data = {
            "host": host,
            "env_file": env_file_used,
            "env_content": env_content,
            "endpoint_status_json": endpoint_status,
            "collected_at": now.isoformat(),
        }
        stored = _store_if_changed(
            db, cluster_id,
            component=f"etcdctl_config:{host}",
            category="etcdctl",
            version=None,
            data=data,
            now=now,
        )
        entry["stored"] = stored
        if stored:
            changed += 1
        per_host.append(entry)

    if changed:
        db.commit()

    return {
        "cluster_id": str(cluster_id),
        "changed": changed,
        "hosts": per_host,
        "errors": errors,
    }


@router.get("/{cluster_id}/versions/current")
def get_current_versions(cluster_id: UUID, db: Session = Depends(get_db)):
    """각 component 별 가장 최근 스냅샷 반환."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # component 별 가장 최근 한 건씩 — SQL 에서 window 함수 쓸 수도 있지만 간단히 Python 에서 처리
    all_snaps = (
        db.query(ClusterConfigSnapshot)
        .filter(ClusterConfigSnapshot.cluster_id == cluster_id)
        .order_by(ClusterConfigSnapshot.component, ClusterConfigSnapshot.collected_at.desc())
        .all()
    )
    seen = set()
    current = []
    for s in all_snaps:
        if s.component in seen:
            continue
        seen.add(s.component)
        current.append({
            "id": str(s.id),
            "component": s.component,
            "category": s.category,
            "version": s.version,
            "data": s.data,
            "collectedAt": s.collected_at.isoformat(),
        })
    return {"cluster_id": str(cluster_id), "components": current}


@router.get("/{cluster_id}/versions/history")
def get_versions_history(
    cluster_id: UUID,
    component: str | None = Query(default=None, description="특정 component 만 필터"),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """스냅샷 히스토리. component 지정 시 해당 컴포넌트만."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    q = db.query(ClusterConfigSnapshot).filter(ClusterConfigSnapshot.cluster_id == cluster_id)
    if component:
        q = q.filter(ClusterConfigSnapshot.component == component)
    snaps = q.order_by(ClusterConfigSnapshot.collected_at.desc()).limit(limit).all()

    return {
        "cluster_id": str(cluster_id),
        "component": component,
        "snapshots": [
            {
                "id": str(s.id),
                "component": s.component,
                "category": s.category,
                "version": s.version,
                "data": s.data,
                "contentHash": s.content_hash,
                "collectedAt": s.collected_at.isoformat(),
            }
            for s in snaps
        ],
    }


@router.get("/{cluster_id}/versions/diff")
def diff_snapshots(
    cluster_id: UUID,
    from_id: UUID = Query(..., alias="from"),
    to_id: UUID = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    """두 스냅샷 간 필드 단위 diff. data dict 가 flat 이 아니면 재귀적으로 비교."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    from_snap = db.query(ClusterConfigSnapshot).filter(
        ClusterConfigSnapshot.id == from_id,
        ClusterConfigSnapshot.cluster_id == cluster_id,
    ).first()
    to_snap = db.query(ClusterConfigSnapshot).filter(
        ClusterConfigSnapshot.id == to_id,
        ClusterConfigSnapshot.cluster_id == cluster_id,
    ).first()
    if not from_snap or not to_snap:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="스냅샷을 찾을 수 없습니다")

    def flatten(d: dict, prefix: str = "") -> dict:
        out = {}
        for k, v in (d or {}).items():
            key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, dict):
                out.update(flatten(v, key))
            else:
                out[key] = v
        return out

    a = flatten(from_snap.data or {})
    b = flatten(to_snap.data or {})
    keys = sorted(set(a.keys()) | set(b.keys()))

    changes = []
    for k in keys:
        va, vb = a.get(k), b.get(k)
        if va != vb:
            changes.append({"key": k, "from": va, "to": vb})

    return {
        "from": {
            "id": str(from_snap.id),
            "component": from_snap.component,
            "version": from_snap.version,
            "collectedAt": from_snap.collected_at.isoformat(),
        },
        "to": {
            "id": str(to_snap.id),
            "component": to_snap.component,
            "version": to_snap.version,
            "collectedAt": to_snap.collected_at.isoformat(),
        },
        "versionChanged": from_snap.version != to_snap.version,
        "changes": changes,
    }


@router.get("/{cluster_id}/versions/graph")
def get_versions_graph(cluster_id: UUID, db: Session = Depends(get_db)):
    """3D 그래프용: 최신 스냅샷 기반으로 노드/엣지 산출.

    Graph 구조:
      - 루트: cluster
      - 카테고리 노드: control_plane, kubelet, cni (있을 때만)
      - 각 component 노드: 그 아래
      - 설정 cross-edge: cilium_config → cilium_agent (uses), kube_proxy → cilium_agent (replaces if kube-proxy disabled)
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    all_snaps = (
        db.query(ClusterConfigSnapshot)
        .filter(ClusterConfigSnapshot.cluster_id == cluster_id)
        .order_by(ClusterConfigSnapshot.component, ClusterConfigSnapshot.collected_at.desc())
        .all()
    )
    # component 당 최신 한 건
    latest: dict[str, ClusterConfigSnapshot] = {}
    for s in all_snaps:
        latest.setdefault(s.component, s)

    nodes: list[dict] = [{
        "id":       f"cluster:{cluster.id}",
        "label":    cluster.name,
        "type":     "cluster",
        "category": "cluster",
    }]
    edges: list[dict] = []

    categories_seen = set()
    for comp, s in latest.items():
        cat = s.category or "other"
        cat_id = f"cat:{cat}"
        if cat_id not in categories_seen:
            categories_seen.add(cat_id)
            nodes.append({"id": cat_id, "label": cat, "type": "category", "category": cat})
            edges.append({"source": f"cluster:{cluster.id}", "target": cat_id, "type": "contains"})

        node_id = f"comp:{comp}"
        nodes.append({
            "id":       node_id,
            "label":    comp,
            "type":     "component",
            "category": cat,
            "version":  s.version,
            "collectedAt": s.collected_at.isoformat(),
        })
        edges.append({"source": cat_id, "target": node_id, "type": "contains"})

        # 주요 flags 를 작은 leaf 노드로 (최대 6개만 — 그래프 폭주 방지)
        flags = (s.data or {}).get("flags") if isinstance(s.data, dict) else None
        if isinstance(flags, dict):
            for idx, (fk, fv) in enumerate(list(flags.items())[:6]):
                leaf_id = f"flag:{comp}:{fk}"
                nodes.append({
                    "id":       leaf_id,
                    "label":    f"{fk}={fv}",
                    "type":     "flag",
                    "category": cat,
                    "value":    str(fv)[:60],
                })
                edges.append({"source": node_id, "target": leaf_id, "type": "param"})

        # cilium_config data → cilium_agent 로 연결
        if comp == "cilium_config":
            agent_node = "comp:cilium_agent"
            edges.append({"source": node_id, "target": agent_node, "type": "configures"})

    # kube_proxy 가 비어있거나 Cilium kubeProxyReplacement 가 true 면 표시
    cilium_cfg = latest.get("cilium_config")
    if cilium_cfg and isinstance(cilium_cfg.data, dict):
        d = cilium_cfg.data.get("data", {}) if isinstance(cilium_cfg.data.get("data"), dict) else {}
        kpr = str(d.get("kube-proxy-replacement", "")).lower()
        if kpr in ("strict", "true", "enabled"):
            if "comp:cilium_agent" in {n["id"] for n in nodes} and "comp:kube_proxy" in {n["id"] for n in nodes}:
                edges.append({
                    "source": "comp:cilium_agent",
                    "target": "comp:kube_proxy",
                    "type":   "replaces",
                })

    return {
        "cluster_id": str(cluster_id),
        "cluster_name": cluster.name,
        "nodes": nodes,
        "edges": edges,
    }
