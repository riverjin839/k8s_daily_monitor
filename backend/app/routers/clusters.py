import os
import subprocess
import tempfile

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
        from app.models.cluster import StatusEnum
        payload["status"] = StatusEnum.pending

    cluster = Cluster(**payload)
    db.add(cluster)
    db.flush()  # cluster.id 확정

    # kubeconfig content 가 있으면 파일로 저장하고 경로 갱신
    if content and content.strip():
        saved_path = _save_kubeconfig_content(cluster.id, content.strip())
        cluster.kubeconfig_path = saved_path

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
    """클러스터 kubeconfig 내용 조회"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    path = cluster.kubeconfig_path
    if not path or not os.path.exists(path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="kubeconfig 파일이 없습니다. 먼저 kubeconfig를 등록하세요.",
        )

    with open(path, encoding="utf-8") as f:
        content = f.read()
    return KubeconfigResponse(content=content, path=path)


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

    saved_path = _save_kubeconfig_content(cluster_id, body.content.strip())
    cluster.kubeconfig_path = saved_path
    db.commit()
    return KubeconfigResponse(content=body.content.strip(), path=saved_path)


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

    # 2. kubeconfig 인증
    kc_path = cluster.kubeconfig_path
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
    return {"cluster_id": str(cluster_id), "cluster_name": cluster.name, "ok": overall_ok, "results": results}


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
