from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster, Playbook
from app.schemas.playbook import (
    PlaybookCreate,
    PlaybookUpdate,
    PlaybookResponse,
    PlaybookListResponse,
    PlaybookRunResponse,
)
from app.services.playbook_executor import run_playbook

router = APIRouter(prefix="/playbooks", tags=["playbooks"])


@router.get("", response_model=PlaybookListResponse)
def list_playbooks(
    cluster_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """클러스터별 또는 전체 Playbook 목록 조회"""
    query = db.query(Playbook)
    if cluster_id:
        query = query.filter(Playbook.cluster_id == cluster_id)
    playbooks = query.order_by(Playbook.created_at.desc()).all()
    return PlaybookListResponse(data=playbooks)


@router.get("/{playbook_id}", response_model=PlaybookResponse)
def get_playbook(playbook_id: UUID, db: Session = Depends(get_db)):
    """Playbook 상세 조회"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")
    return playbook


@router.post("", response_model=PlaybookResponse, status_code=status.HTTP_201_CREATED)
def create_playbook(payload: PlaybookCreate, db: Session = Depends(get_db)):
    """새 Playbook 등록"""
    # 클러스터 존재 확인
    cluster = db.query(Cluster).filter(Cluster.id == payload.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # 중복 체크 (같은 클러스터에 같은 이름)
    existing = (
        db.query(Playbook)
        .filter(Playbook.cluster_id == payload.cluster_id, Playbook.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Playbook '{payload.name}' already exists for this cluster",
        )

    playbook = Playbook(**payload.model_dump())
    db.add(playbook)
    db.commit()
    db.refresh(playbook)
    return playbook


@router.put("/{playbook_id}", response_model=PlaybookResponse)
def update_playbook(playbook_id: UUID, payload: PlaybookUpdate, db: Session = Depends(get_db)):
    """Playbook 수정"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(playbook, key, value)

    db.commit()
    db.refresh(playbook)
    return playbook


@router.delete("/{playbook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playbook(playbook_id: UUID, db: Session = Depends(get_db)):
    """Playbook 삭제"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    db.delete(playbook)
    db.commit()
    return None


@router.post("/{playbook_id}/run", response_model=PlaybookRunResponse)
def run_playbook_endpoint(playbook_id: UUID, db: Session = Depends(get_db)):
    """Playbook 실행 (동기)"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    # running 상태로 업데이트
    playbook.status = "running"
    db.commit()

    # 실행
    result = run_playbook(
        playbook_path=playbook.playbook_path,
        inventory_path=playbook.inventory_path,
        extra_vars=playbook.extra_vars,
        tags=playbook.tags,
    )

    # 결과 저장
    playbook.status = result.status
    playbook.last_run_at = datetime.utcnow()
    playbook.last_result = {
        "message": result.message,
        "stats": result.stats,
        "duration_ms": result.duration_ms,
        "raw_output": result.raw_output[:5000] if result.raw_output else None,
    }
    db.commit()
    db.refresh(playbook)

    return PlaybookRunResponse(
        id=playbook.id,
        status=result.status,
        message=result.message,
        stats=result.stats,
        duration_ms=result.duration_ms,
    )
