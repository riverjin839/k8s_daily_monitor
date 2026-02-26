import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.database import get_db
from app.models import Cluster, Addon
from app.schemas import (
    ClusterCreate,
    ClusterUpdate,
    ClusterResponse,
    ClusterListResponse,
)

_CONNECT_TIMEOUT = 5  # seconds


def _verify_cluster_connectivity(api_endpoint: str, kubeconfig_path: str | None) -> None:
    """
    클러스터 등록 전 연결 가능 여부 검증.
    - kubeconfig_path 가 제공된 경우: 파일 존재 여부 확인
    - api_endpoint: /healthz 로 HTTP 요청, 응답이 있으면 OK (401/403 포함)
    연결 실패 시 HTTPException(422) 발생.
    """
    # 1) kubeconfig 파일 존재 확인
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

# 클러스터 생성 시 자동 등록할 기본 애드온
DEFAULT_ADDONS = [
    {
        "name": "etcd Leader",
        "type": "etcd-leader",
        "icon": "💾",
        "description": "etcd leader election & health status",
    },
    {
        "name": "Node Status",
        "type": "node-check",
        "icon": "🖥️",
        "description": "Node readiness & pressure conditions",
    },
    {
        "name": "Control Plane",
        "type": "control-plane",
        "icon": "🎛️",
        "description": "API Server, Scheduler, Controller Manager",
    },
    {
        "name": "CoreDNS",
        "type": "system-pod",
        "icon": "🔍",
        "description": "Cluster DNS service",
    },
]

router = APIRouter(prefix="/clusters", tags=["clusters"])


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    return cluster


@router.post("", response_model=ClusterResponse, status_code=status.HTTP_201_CREATED)
def create_cluster(cluster_data: ClusterCreate, db: Session = Depends(get_db)):
    """클러스터 생성 (등록 전 연결 검증 포함)"""
    # 중복 이름 체크
    existing = db.query(Cluster).filter(Cluster.name == cluster_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cluster with this name already exists"
        )

    # 연결 검증 — 실패 시 422 반환, DB 저장 안 함
    _verify_cluster_connectivity(cluster_data.api_endpoint, cluster_data.kubeconfig_path)

    cluster = Cluster(**cluster_data.model_dump())
    db.add(cluster)
    db.flush()  # ID 생성을 위해 flush

    # 기본 애드온 자동 등록
    for addon_config in DEFAULT_ADDONS:
        addon = Addon(cluster_id=cluster.id, **addon_config)
        db.add(addon)

    db.commit()
    db.refresh(cluster)
    return cluster


@router.put("/{cluster_id}", response_model=ClusterResponse)
def update_cluster(
    cluster_id: UUID,
    cluster_data: ClusterUpdate,
    db: Session = Depends(get_db)
):
    """클러스터 수정"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    
    db.delete(cluster)
    db.commit()
    return None
