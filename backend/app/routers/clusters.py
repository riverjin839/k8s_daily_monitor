import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from uuid import UUID

from app.config import settings
from app.database import get_db
from app.models import Cluster, Addon
from app.models.daily_check import DailyCheckLog, CheckSchedule
from app.models.issue import Issue
from app.models.task import Task
from app.schemas import (
    ClusterCreate,
    ClusterUpdate,
    ClusterResponse,
    ClusterListResponse,
)

_CONNECT_TIMEOUT = 5  # seconds


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
    """클러스터 생성 (등록 전 연결 검증 포함)"""
    # 중복 이름 체크
    existing = db.query(Cluster).filter(Cluster.name == cluster_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cluster with this name already exists",
        )

    # kubeconfig_content → 임시 경로에 저장해 kubeconfig_path 로 활용
    # (실제 파일 저장은 cluster_id 확정 후에 하므로, 먼저 객체 생성)
    payload = cluster_data.model_dump(exclude={"kubeconfig_content"})
    content = cluster_data.kubeconfig_content

    # 연결 검증 (kubeconfig_path 는 content 저장 전 단계이므로 None 으로 전달)
    effective_path = payload.get("kubeconfig_path")
    _verify_cluster_connectivity(cluster_data.api_endpoint, effective_path)

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
