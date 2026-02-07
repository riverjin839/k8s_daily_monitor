from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from uuid import UUID

from app.database import get_db
from app.models import Cluster, Addon, CheckLog, StatusEnum
from app.schemas import (
    AddonCreate,
    AddonResponse,
    AddonListResponse,
    ClusterResponse,
    SummaryStatsResponse,
)
from app.services.health_checker import HealthChecker

router = APIRouter(prefix="/health", tags=["health"])


@router.post("/check/{cluster_id}")
async def run_health_check(
    cluster_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """클러스터 헬스 체크 실행"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    
    # 백그라운드에서 헬스 체크 실행
    checker = HealthChecker(db)
    background_tasks.add_task(checker.run_check, cluster_id)
    
    return {"message": "Health check started", "cluster_id": str(cluster_id)}


@router.get("/status/{cluster_id}", response_model=ClusterResponse)
def get_cluster_status(cluster_id: UUID, db: Session = Depends(get_db)):
    """클러스터 현재 상태 조회"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    return cluster


@router.get("/addons/{cluster_id}", response_model=AddonListResponse)
def get_cluster_addons(cluster_id: UUID, db: Session = Depends(get_db)):
    """클러스터의 애드온 상태 조회"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    
    addons = db.query(Addon).filter(Addon.cluster_id == cluster_id).all()
    return AddonListResponse(data=addons)


@router.post("/addons", response_model=AddonResponse, status_code=status.HTTP_201_CREATED)
def create_addon(addon_data: AddonCreate, db: Session = Depends(get_db)):
    """애드온 생성"""
    cluster = db.query(Cluster).filter(Cluster.id == addon_data.cluster_id).first()
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )

    # 중복 체크
    existing = db.query(Addon).filter(
        Addon.cluster_id == addon_data.cluster_id,
        Addon.name == addon_data.name
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Addon '{addon_data.name}' already exists for this cluster"
        )

    addon = Addon(**addon_data.model_dump())
    db.add(addon)
    db.commit()
    db.refresh(addon)
    return addon


@router.delete("/addons/{addon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_addon(addon_id: UUID, db: Session = Depends(get_db)):
    """애드온 삭제"""
    addon = db.query(Addon).filter(Addon.id == addon_id).first()
    if not addon:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Addon not found"
        )
    db.delete(addon)
    db.commit()
    return None


@router.get("/summary", response_model=SummaryStatsResponse)
def get_summary_stats(db: Session = Depends(get_db)):
    """전체 클러스터 요약 통계"""
    clusters = db.query(Cluster).all()
    
    total = len(clusters)
    healthy = sum(1 for c in clusters if c.status == StatusEnum.healthy)
    warning = sum(1 for c in clusters if c.status == StatusEnum.warning)
    critical = sum(1 for c in clusters if c.status == StatusEnum.critical)
    
    return SummaryStatsResponse(
        total_clusters=total,
        healthy=healthy,
        warning=warning,
        critical=critical
    )
