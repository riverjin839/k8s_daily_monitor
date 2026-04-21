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
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from kubernetes import client as k8s_client, config as k8s_config
from kubernetes.client import ApiException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster, ClusterConfigSnapshot

router = APIRouter(prefix="/clusters", tags=["versions"])

_K8S_TIMEOUT = 10


# ── helpers ──────────────────────────────────────────────────────────────────

def _ensure_kubeconfig_file_for(cluster: Cluster) -> str | None:
    """cluster.kubeconfig_content 가 있으면 파일로 재생성. 파일이 이미 있으면 그 경로."""
    if cluster.kubeconfig_path and os.path.exists(cluster.kubeconfig_path):
        return cluster.kubeconfig_path
    if cluster.kubeconfig_content:
        # clusters.py 의 _save_kubeconfig_content 와 동일 규칙
        from app.config import settings as app_settings
        store_dir = app_settings.kubeconfig_store_dir
        os.makedirs(store_dir, exist_ok=True)
        path = os.path.join(store_dir, f"{cluster.id}.yaml")
        with open(path, "w", encoding="utf-8") as f:
            f.write(cluster.kubeconfig_content)
        os.chmod(path, 0o600)
        return path
    return None


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
