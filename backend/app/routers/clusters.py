import os
import subprocess
import tempfile
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from kubernetes import client as k8s_client, config as k8s_config
from kubernetes.client import ApiException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from uuid import UUID

from app.config import settings
from app.database import get_db
from app.models import Cluster, Addon
from app.models.cluster import StatusEnum
from app.models.daily_check import DailyCheckLog, CheckSchedule
from app.models.issue import Issue
from app.models.task import Task
from app.services.health_checker import HealthChecker
from app.schemas import (
    ClusterCreate,
    ClusterUpdate,
    ClusterResponse,
    ClusterListResponse,
)

_CONNECT_TIMEOUT = 5  # seconds
_K8S_AUTH_TIMEOUT = 5  # seconds


# ── helpers ──────────────────────────────────────────────────────────────────

def _kubeconfig_store_path(cluster_id: UUID) -> str:
    """클러스터 ID 기반 kubeconfig 저장 경로"""
    return os.path.join(settings.kubeconfig_store_dir, f"{cluster_id}.yaml")


def _save_kubeconfig_content(cluster_id: UUID, content: str) -> str:
    """kubeconfig YAML 내용을 파일로 저장하고 경로를 반환."""
    store_dir = settings.kubeconfig_store_dir
    os.makedirs(store_dir, exist_ok=True)
    path = _kubeconfig_store_path(cluster_id)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(path, 0o600)  # 소유자만 읽기/쓰기
    return path


def _ensure_kubeconfig_file(cluster: Cluster) -> str | None:
    """DB 에 저장된 kubeconfig_content 가 있으면 파일을 (재)생성하고 경로를 반환.
    파일이 이미 있으면 그대로, 없으면 컨텐츠로 다시 써준다.
    둘 다 없으면 None.
    """
    if cluster.kubeconfig_path and os.path.exists(cluster.kubeconfig_path):
        return cluster.kubeconfig_path
    if cluster.kubeconfig_content:
        return _save_kubeconfig_content(cluster.id, cluster.kubeconfig_content)
    return cluster.kubeconfig_path or None


def _verify_cluster_connectivity(api_endpoint: str, kubeconfig_path: str | None) -> None:
    """
    클러스터 등록 전 연결 가능 여부 검증.
    - kubeconfig_path 가 제공된 경우: 파일 존재 여부 확인
    - api_endpoint: /healthz 로 HTTP 요청, 응답이 있으면 OK (401/403 포함)
    연결 실패 시 HTTPException(422) 발생.
    """
    # 1) kubeconfig 파일 존재 확인 (경로가 직접 지정된 경우)
    if kubeconfig_path:
        if not os.path.exists(kubeconfig_path):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"kubeconfig 파일을 찾을 수 없습니다: '{kubeconfig_path}'. 경로를 확인하세요.",
            )

    # 2) API 엔드포인트 연결 확인
    healthz_url = api_endpoint.rstrip("/") + "/healthz"
    try:
        with httpx.Client(verify=False, timeout=_CONNECT_TIMEOUT) as client:
            resp = client.get(healthz_url)
        # 401/403 은 인증 문제일 뿐 엔드포인트 자체는 정상
        if resp.status_code >= 500:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"클러스터 API 서버가 오류를 반환했습니다 (HTTP {resp.status_code}). "
                       "API Endpoint를 확인하세요.",
            )
    except HTTPException:
        raise
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"클러스터 API 서버에 연결할 수 없습니다: '{api_endpoint}'. "
                   "API Endpoint 주소가 올바른지 확인하세요.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"클러스터 API 서버 연결 시간 초과 ({_CONNECT_TIMEOUT}s): '{api_endpoint}'. "
                   "네트워크 연결 및 방화벽 설정을 확인하세요.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"클러스터 연결 검증 실패: {str(exc)[:200]}",
        )

    # 3) kubeconfig 로 인증 가능한지 확인 (제공된 경우)
    if kubeconfig_path:
        _verify_kubeconfig_auth(api_endpoint, kubeconfig_path)


def _verify_kubeconfig_auth(api_endpoint: str, kubeconfig_path: str) -> None:
    """kubeconfig 인증/권한 유효성 검증."""
    try:
        api_client = k8s_config.new_client_from_config(config_file=kubeconfig_path)
        kubeconfig_host = (api_client.configuration.host or "").rstrip("/")
        normalized_api_endpoint = api_endpoint.rstrip("/")
        if kubeconfig_host and kubeconfig_host != normalized_api_endpoint:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "kubeconfig 서버 주소와 API Endpoint가 일치하지 않습니다. "
                    f"kubeconfig: '{kubeconfig_host}', API Endpoint: '{normalized_api_endpoint}'"
                ),
            )

        v1 = k8s_client.CoreV1Api(api_client)
        v1.list_namespace(limit=1, _request_timeout=_K8S_AUTH_TIMEOUT)
    except HTTPException:
        raise
    except ApiException as exc:
        if exc.status in (401, 403):
            detail = "kubeconfig 인증에 실패했습니다. 토큰/인증서 또는 권한을 확인하세요."
        else:
            detail = f"kubeconfig 검증 실패 (HTTP {exc.status}): {exc.reason}"
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"kubeconfig 검증 실패: {str(exc)[:200]}",
        )


# ── 클러스터 생성 시 자동 등록할 기본 애드온 ─────────────────────────────────
DEFAULT_ADDONS = [
    {"name": "etcd Leader",    "type": "etcd-leader",    "icon": "💾", "description": "etcd leader election & health status"},
    {"name": "Node Status",    "type": "node-check",     "icon": "🖥️", "description": "Node readiness & pressure conditions"},
    {"name": "Control Plane",  "type": "control-plane",  "icon": "🎛️", "description": "API Server, Scheduler, Controller Manager"},
    {"name": "CoreDNS",        "type": "system-pod",     "icon": "🔍", "description": "Cluster DNS service"},
]

router = APIRouter(prefix="/clusters", tags=["clusters"])


# ── Kubeconfig request/response schemas ───────────────────────────────────────
class KubeconfigUpdateRequest(BaseModel):
    content: str


class KubeconfigResponse(BaseModel):
    content: str
    path: str


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=ClusterListResponse)
def get_clusters(db: Session = Depends(get_db)):
    """전체 클러스터 목록 조회"""
    clusters = db.query(Cluster).order_by(Cluster.name).all()
    return ClusterListResponse(data=clusters)


@router.get("/{cluster_id}", response_model=ClusterResponse)
def get_cluster(cluster_id: UUID, db: Session = Depends(get_db)):
    """클러스터 상세 조회"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    return cluster


@router.post("", response_model=ClusterResponse, status_code=status.HTTP_201_CREATED)
def create_cluster(cluster_data: ClusterCreate, db: Session = Depends(get_db)):
    """클러스터 생성 (등록 전 연결 검증 포함, skip_connectivity_check=True 시 임시 등록)"""
    # 중복 이름 체크
    existing = db.query(Cluster).filter(Cluster.name == cluster_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cluster with this name already exists",
        )

    # kubeconfig_content 는 임시 파일에 저장 후 검증에 활용
    payload = cluster_data.model_dump(exclude={"kubeconfig_content", "skip_connectivity_check"})
    content = cluster_data.kubeconfig_content
    effective_path = payload.get("kubeconfig_path")
    skip_check = cluster_data.skip_connectivity_check

    connectivity_failed = False
    connectivity_error: str | None = None

    temp_kubeconfig_path = None
    if content and content.strip():
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False, encoding="utf-8") as temp_file:
            temp_file.write(content.strip())
            temp_kubeconfig_path = temp_file.name
        effective_path = temp_kubeconfig_path

    try:
        api_ep = (cluster_data.api_endpoint or '').strip()
        if skip_check or not api_ep:
            # 연결 검증 생략 — 실패해도 임시(pending) 상태로 등록
            if api_ep:
                try:
                    _verify_cluster_connectivity(api_ep, effective_path)
                except HTTPException as exc:
                    connectivity_failed = True
                    connectivity_error = exc.detail
            else:
                connectivity_failed = True
                connectivity_error = "API Endpoint 미입력 — 임시(가등록) 상태"
        else:
            _verify_cluster_connectivity(api_ep, effective_path)
    finally:
        if temp_kubeconfig_path and os.path.exists(temp_kubeconfig_path):
            os.remove(temp_kubeconfig_path)

    # 연결 실패 시 pending 상태로 설정
    if connectivity_failed:
        payload["status"] = StatusEnum.pending

    cluster = Cluster(**payload)
    db.add(cluster)
    db.flush()  # cluster.id 확정

    # kubeconfig content 가 있으면 DB 에 보관하고 파일로도 저장
    if content and content.strip():
        cleaned = content.strip()
        cluster.kubeconfig_content = cleaned
        cluster.kubeconfig_path = _save_kubeconfig_content(cluster.id, cleaned)

    # 기본 애드온 자동 등록
    for addon_config in DEFAULT_ADDONS:
        db.add(Addon(cluster_id=cluster.id, **addon_config))

    db.commit()

    # pending 상태가 아닌 경우에만 초기 점검 수행
    if not connectivity_failed:
        HealthChecker(db).run_check(cluster.id)

    db.refresh(cluster)
    return cluster


@router.put("/{cluster_id}", response_model=ClusterResponse)
def update_cluster(cluster_id: UUID, cluster_data: ClusterUpdate, db: Session = Depends(get_db)):
    """클러스터 수정"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    update_data = cluster_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(cluster, key, value)

    db.commit()
    db.refresh(cluster)
    return cluster


@router.delete("/{cluster_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cluster(cluster_id: UUID, db: Session = Depends(get_db)):
    """클러스터 삭제"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # 저장된 kubeconfig 파일 삭제
    stored_path = _kubeconfig_store_path(cluster_id)
    if os.path.exists(stored_path):
        try:
            os.remove(stored_path)
        except OSError:
            pass

    # FK 제약 때문에 Cluster 삭제 전 연관 데이터 처리
    # - DailyCheckLog, CheckSchedule: cluster_id NOT NULL → 먼저 삭제
    db.query(DailyCheckLog).filter(DailyCheckLog.cluster_id == cluster_id).delete(synchronize_session=False)
    db.query(CheckSchedule).filter(CheckSchedule.cluster_id == cluster_id).delete(synchronize_session=False)
    # - Issue, Task: cluster_id nullable → NULL 처리 (레코드 보관)
    db.query(Issue).filter(Issue.cluster_id == cluster_id).update(
        {"cluster_id": None}, synchronize_session=False
    )
    db.query(Task).filter(Task.cluster_id == cluster_id).update(
        {"cluster_id": None}, synchronize_session=False
    )

    db.delete(cluster)
    db.commit()
    return None


@router.get("/{cluster_id}/kubeconfig", response_model=KubeconfigResponse)
def get_kubeconfig(cluster_id: UUID, db: Session = Depends(get_db)):
    """클러스터 kubeconfig 내용 조회 — DB 우선, 파일은 폴백."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # 1) DB 에 kubeconfig_content 가 있으면 그것이 진실 (컨테이너 재시작 대비)
    if cluster.kubeconfig_content:
        # 파일이 없으면 재생성해서 kubectl/k8s SDK 경로 수요도 채움
        path = _ensure_kubeconfig_file(cluster) or ""
        if path and path != cluster.kubeconfig_path:
            cluster.kubeconfig_path = path
            db.commit()
        return KubeconfigResponse(content=cluster.kubeconfig_content, path=path)

    # 2) DB 에는 없고 파일만 있는 (구) 레코드 호환
    path = cluster.kubeconfig_path
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            content = f.read()
        # 다음 조회부터는 DB 에서 바로 내려주도록 백필
        cluster.kubeconfig_content = content
        db.commit()
        return KubeconfigResponse(content=content, path=path)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="kubeconfig 파일이 없습니다. 먼저 kubeconfig를 등록하세요.",
    )


@router.put("/{cluster_id}/kubeconfig", response_model=KubeconfigResponse)
def update_kubeconfig(
    cluster_id: UUID,
    body: KubeconfigUpdateRequest,
    db: Session = Depends(get_db),
):
    """클러스터 kubeconfig 내용 저장/수정"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    if not body.content.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="kubeconfig 내용이 비어 있습니다.",
        )

    cleaned = body.content.strip()
    saved_path = _save_kubeconfig_content(cluster_id, cleaned)
    cluster.kubeconfig_path = saved_path
    cluster.kubeconfig_content = cleaned
    db.commit()
    return KubeconfigResponse(content=cleaned, path=saved_path)


@router.post("/{cluster_id}/verify")
def verify_cluster(cluster_id: UUID, db: Session = Depends(get_db)):
    """클러스터 연결 상태 상세 검증"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    results = []

    # 1. API Server 연결
    try:
        healthz_url = (cluster.api_endpoint or "").rstrip("/") + "/healthz"
        with httpx.Client(verify=False, timeout=_CONNECT_TIMEOUT) as client:
            resp = client.get(healthz_url)
        ok = resp.status_code < 500
        results.append({"check": "api_server", "ok": ok, "detail": f"HTTP {resp.status_code} — {resp.text[:80].strip()}"})
    except httpx.ConnectError as e:
        results.append({"check": "api_server", "ok": False, "detail": f"연결 실패: {str(e)[:80]}"})
    except httpx.TimeoutException:
        results.append({"check": "api_server", "ok": False, "detail": f"타임아웃 ({_CONNECT_TIMEOUT}s)"})
    except Exception as e:
        results.append({"check": "api_server", "ok": False, "detail": str(e)[:80]})

    # 2. kubeconfig 인증 — 파일이 없으면 DB content 로 재생성 시도
    kc_path = _ensure_kubeconfig_file(cluster)
    if kc_path and os.path.exists(kc_path):
        try:
            api_client = k8s_config.new_client_from_config(config_file=kc_path)
            v1 = k8s_client.CoreV1Api(api_client)
            v1.list_namespace(limit=1, _request_timeout=_K8S_AUTH_TIMEOUT)
            results.append({"check": "kubeconfig_auth", "ok": True, "detail": "인증 성공"})
        except ApiException as e:
            results.append({"check": "kubeconfig_auth", "ok": False, "detail": f"HTTP {e.status}: {e.reason}"})
        except Exception as e:
            results.append({"check": "kubeconfig_auth", "ok": False, "detail": str(e)[:80]})
    else:
        results.append({"check": "kubeconfig_auth", "ok": None, "detail": "kubeconfig 파일 없음"})

    # 3. kubectl get nodes
    if kc_path and os.path.exists(kc_path):
        try:
            cmd = ["kubectl", "--kubeconfig", kc_path]
            if cluster.api_endpoint:
                cmd += ["--server", cluster.api_endpoint]
            cmd += ["get", "nodes", "--no-headers"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.returncode == 0:
                node_lines = [l for l in res.stdout.strip().split("\n") if l]
                results.append({"check": "kubectl_nodes", "ok": True, "detail": f"{len(node_lines)}개 노드 조회 성공"})
            else:
                results.append({"check": "kubectl_nodes", "ok": False, "detail": res.stderr.strip()[:100]})
        except Exception as e:
            results.append({"check": "kubectl_nodes", "ok": False, "detail": str(e)[:80]})
    else:
        results.append({"check": "kubectl_nodes", "ok": None, "detail": "kubeconfig 파일 없음"})

    overall_ok = all(r["ok"] is True for r in results if r["ok"] is not None)

    # 연결 확인 결과를 cluster.status 에 반영 — OK → healthy, 실패 → critical
    # (전체 HealthChecker 가 돌기 전까지 가장 최신의 연결 상태를 보여주기 위함)
    cluster.status = StatusEnum.healthy if overall_ok else StatusEnum.critical
    cluster.updated_at = datetime.utcnow()
    db.commit()

    return {"cluster_id": str(cluster_id), "cluster_name": cluster.name, "ok": overall_ok, "results": results}


# ── 자동 업데이트 (kubeconfig 기반) ───────────────────────────────────────────

def _extract_flag_value(container_spec, flag: str) -> str | None:
    """kube-apiserver / kube-controller-manager 컨테이너 command/args 에서 --flag=value 또는 --flag value 추출."""
    tokens: list[str] = []
    if container_spec.command:
        tokens.extend(container_spec.command)
    if container_spec.args:
        tokens.extend(container_spec.args)
    prefix = f"--{flag}="
    for i, tok in enumerate(tokens):
        if tok.startswith(prefix):
            return tok[len(prefix):]
        if tok == f"--{flag}" and i + 1 < len(tokens):
            return tokens[i + 1]
    return None


def _cidr_range(cidr: str | None) -> tuple[str | None, str | None]:
    """CIDR 에서 first/last host 를 계산 (IPv4). 실패 시 (None, None)."""
    if not cidr:
        return None, None
    try:
        import ipaddress
        net = ipaddress.ip_network(cidr.strip(), strict=False)
        hosts = list(net.hosts()) if net.num_addresses > 2 else [net.network_address, net.broadcast_address]
        if not hosts:
            return None, None
        return str(hosts[0]), str(hosts[-1])
    except Exception:
        return None, None


@router.post("/{cluster_id}/auto-update")
def auto_update_cluster(cluster_id: UUID, db: Session = Depends(get_db)):
    """kubeconfig/k8s API 만으로 얻을 수 있는 클러스터 메타데이터를 자동 수집/반영.

    채우는 필드: node_count, hostname (master 후보), max_pod, pod_cidr/first/last,
    svc_cidr/first/last, cilium_config, bgp_enabled, as_number.
    NIC (bond*), Node CIDR 비트마스크는 kubeconfig 만으로는 알 수 없어 건너뜀.
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    kc_path = _ensure_kubeconfig_file(cluster)
    if not kc_path or not os.path.exists(kc_path):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="kubeconfig가 없습니다. 먼저 kubeconfig를 등록하세요.",
        )

    updated: dict[str, object] = {}
    warnings: list[str] = []

    try:
        api_client = k8s_config.new_client_from_config(config_file=kc_path)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"kubeconfig 로드 실패: {str(e)[:120]}")

    v1 = k8s_client.CoreV1Api(api_client)
    custom = k8s_client.CustomObjectsApi(api_client)

    # 1. nodes → node_count, hostname(master), max_pod, pod_cidr (node.spec.podCIDR 기반)
    try:
        nodes = v1.list_node(_request_timeout=_K8S_AUTH_TIMEOUT * 2)
        items = nodes.items
        cluster.node_count = len(items)
        updated["nodeCount"] = len(items)

        master_labels = ("node-role.kubernetes.io/control-plane", "node-role.kubernetes.io/master")
        master_nodes = [n for n in items if any(l in (n.metadata.labels or {}) for l in master_labels)]
        pick = (master_nodes or items)[0] if items else None
        if pick:
            cluster.hostname = pick.metadata.name
            updated["hostname"] = pick.metadata.name
            allocatable = (pick.status.allocatable or {}) if pick.status else {}
            pods_str = allocatable.get("pods")
            if pods_str:
                try:
                    cluster.max_pod = int(pods_str)
                    updated["maxPod"] = int(pods_str)
                except ValueError:
                    warnings.append(f"maxPod 파싱 실패: {pods_str}")

        # pod CIDR: 노드 spec.podCIDR 들을 모아 최소 덮는 대역을 추정하기는 어렵고,
        # kube-controller-manager --cluster-cidr 를 우선 사용. 아래에서 처리.
    except Exception as e:
        warnings.append(f"nodes 조회 실패: {str(e)[:120]}")

    # 2. kube-system 의 kube-apiserver / kube-controller-manager pod 의 플래그에서 CIDR 추출
    try:
        sys_pods = v1.list_namespaced_pod("kube-system", _request_timeout=_K8S_AUTH_TIMEOUT * 2)
        api_pod = next((p for p in sys_pods.items if p.metadata.name.startswith("kube-apiserver")), None)
        ctrl_pod = next((p for p in sys_pods.items if p.metadata.name.startswith("kube-controller-manager")), None)

        if api_pod and api_pod.spec.containers:
            svc_range = _extract_flag_value(api_pod.spec.containers[0], "service-cluster-ip-range")
            if svc_range:
                cluster.svc_cidr = svc_range
                first, last = _cidr_range(svc_range)
                cluster.svc_first_host = first
                cluster.svc_last_host = last
                updated["svcCidr"] = svc_range
                if first: updated["svcFirstHost"] = first
                if last: updated["svcLastHost"] = last

        if ctrl_pod and ctrl_pod.spec.containers:
            pod_range = _extract_flag_value(ctrl_pod.spec.containers[0], "cluster-cidr")
            if pod_range:
                cluster.pod_cidr = pod_range
                first, last = _cidr_range(pod_range)
                cluster.pod_first_host = first
                cluster.pod_last_host = last
                updated["podCidr"] = pod_range
                if first: updated["podFirstHost"] = first
                if last: updated["podLastHost"] = last
    except Exception as e:
        warnings.append(f"system pods 플래그 조회 실패: {str(e)[:120]}")

    # 3. Cilium config — ConfigMap/kube-system/cilium-config
    try:
        cm = v1.read_namespaced_config_map("cilium-config", "kube-system", _request_timeout=_K8S_AUTH_TIMEOUT * 2)
        data = cm.data or {}
        # 핵심만 보여주기 (tunnel, kube-proxy-replacement, ipv4-native-routing-cidr, enable-bgp-control-plane 등)
        interesting_keys = [
            "tunnel", "routing-mode", "kube-proxy-replacement",
            "ipv4-native-routing-cidr", "ipv6-native-routing-cidr",
            "enable-bgp-control-plane", "bpf-lb-mode", "cluster-pool-ipv4-cidr",
        ]
        lines = [f"{k}: {data[k]}" for k in interesting_keys if k in data]
        if lines:
            cluster.cilium_config = "\n".join(lines)
            updated["ciliumConfig"] = cluster.cilium_config
        if data.get("enable-bgp-control-plane", "").lower() == "true":
            cluster.bgp_enabled = True
            updated["bgpEnabled"] = True
    except ApiException as e:
        if e.status != 404:
            warnings.append(f"cilium-config 조회 실패: HTTP {e.status}")
    except Exception as e:
        warnings.append(f"cilium-config 조회 실패: {str(e)[:120]}")

    # 4. Cilium BGP — CiliumBGPClusterConfig (신규) 또는 CiliumBGPPeeringPolicy (구) CR
    try:
        # 신규 CRD (Cilium 1.16+)
        crs = custom.list_cluster_custom_object(
            group="cilium.io", version="v2alpha1", plural="ciliumbgpclusterconfigs",
            _request_timeout=_K8S_AUTH_TIMEOUT * 2,
        )
        items = crs.get("items") or []
        for item in items:
            for inst in (item.get("spec", {}).get("bgpInstances") or []):
                local_asn = inst.get("localASN")
                if local_asn:
                    cluster.bgp_enabled = True
                    cluster.as_number = str(local_asn)
                    updated["bgpEnabled"] = True
                    updated["asNumber"] = str(local_asn)
                    break
    except ApiException:
        # 신규 CRD 없으면 구 버전 시도
        try:
            crs = custom.list_cluster_custom_object(
                group="cilium.io", version="v2alpha1", plural="ciliumbgppeeringpolicies",
                _request_timeout=_K8S_AUTH_TIMEOUT * 2,
            )
            for item in (crs.get("items") or []):
                for vr in (item.get("spec", {}).get("virtualRouters") or []):
                    local_asn = vr.get("localASN")
                    if local_asn:
                        cluster.bgp_enabled = True
                        cluster.as_number = str(local_asn)
                        updated["bgpEnabled"] = True
                        updated["asNumber"] = str(local_asn)
                        break
        except ApiException:
            pass  # BGP 미설정 클러스터
        except Exception as e:
            warnings.append(f"BGP 조회 실패: {str(e)[:120]}")
    except Exception as e:
        warnings.append(f"BGP 조회 실패: {str(e)[:120]}")

    cluster.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cluster)

    return {
        "cluster_id": str(cluster_id),
        "cluster_name": cluster.name,
        "updated": updated,
        "warnings": warnings,
    }


@router.get("/{cluster_id}/cilium-config")
def get_cluster_cilium_config(cluster_id: UUID, db: Session = Depends(get_db)):
    """Cilium ConfigMap 조회 (kubectl 또는 저장된 설정)"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    live_config = None
    error_msg = None
    kc_path = cluster.kubeconfig_path
    if kc_path and os.path.exists(kc_path):
        try:
            cmd = ["kubectl", "--kubeconfig", kc_path]
            if cluster.api_endpoint:
                cmd += ["--server", cluster.api_endpoint]
            cmd += ["-n", "kube-system", "get", "configmap", "cilium-config", "-o", "yaml"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if res.returncode == 0:
                live_config = res.stdout
            else:
                error_msg = res.stderr.strip()[:200]
        except Exception as e:
            error_msg = str(e)[:100]

    return {
        "live": live_config,
        "stored": cluster.cilium_config,
        "source": "live" if live_config else ("stored" if cluster.cilium_config else "none"),
        "error": error_msg,
    }
