from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.database import get_db
from app.models import Cluster
from app.schemas import (
    ClusterCreate,
    ClusterUpdate,
    ClusterResponse,
    ClusterListResponse,
)

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
    """클러스터 생성"""
    # 중복 이름 체크
    existing = db.query(Cluster).filter(Cluster.name == cluster_data.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cluster with this name already exists"
        )
    
    cluster = Cluster(**cluster_data.model_dump())
    db.add(cluster)
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
