from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
import csv
import io

from app.database import get_db
from app.models import CheckLog, Cluster, Addon
from app.schemas import CheckLogListResponse, CheckLogResponse

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=CheckLogListResponse)
def get_check_logs(
    cluster_id: Optional[UUID] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """점검 히스토리 조회"""
    query = db.query(CheckLog).join(Cluster)
    
    if cluster_id:
        query = query.filter(CheckLog.cluster_id == cluster_id)
    
    # 총 개수
    total = query.count()
    
    # 페이지네이션
    logs = (
        query
        .order_by(CheckLog.checked_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    
    # Response 변환
    log_responses = []
    for log in logs:
        addon_name = None
        if log.addon_id:
            addon = db.query(Addon).filter(Addon.id == log.addon_id).first()
            addon_name = addon.name if addon else None
        
        log_responses.append(CheckLogResponse(
            id=log.id,
            cluster_id=log.cluster_id,
            cluster_name=log.cluster.name,
            addon_id=log.addon_id,
            addon_name=addon_name,
            status=log.status,
            message=log.message,
            raw_output=log.raw_output,
            checked_at=log.checked_at
        ))
    
    return CheckLogListResponse(
        data=log_responses,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/{cluster_id}/export")
def export_logs_csv(cluster_id: UUID, db: Session = Depends(get_db)):
    """클러스터 로그 CSV 내보내기"""
    logs = (
        db.query(CheckLog)
        .filter(CheckLog.cluster_id == cluster_id)
        .order_by(CheckLog.checked_at.desc())
        .all()
    )
    
    # CSV 생성
    output = io.StringIO()
    writer = csv.writer(output)
    
    # 헤더
    writer.writerow(["ID", "Status", "Message", "Checked At"])
    
    # 데이터
    for log in logs:
        writer.writerow([
            str(log.id),
            log.status.value,
            log.message,
            log.checked_at.isoformat()
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=cluster_{cluster_id}_logs.csv"
        }
    )
