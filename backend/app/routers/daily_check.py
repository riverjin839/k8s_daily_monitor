"""
일일 K8s 클러스터 헬스 체크 API
- 수동/스케줄 체크 실행
- 체크 결과 조회
- 스케줄 설정
"""
from datetime import datetime, date, time
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models import Cluster, DailyCheckLog, CheckSchedule, CheckScheduleType, StatusEnum
from app.services.daily_checker import DailyChecker


router = APIRouter(prefix="/daily-check", tags=["Daily Check"])


# ============================================
# Schemas
# ============================================

class DailyCheckResponse(BaseModel):
    id: UUID
    cluster_id: UUID
    schedule_type: CheckScheduleType
    check_date: datetime
    overall_status: StatusEnum
    api_server_status: StatusEnum
    api_server_response_time_ms: Optional[int]
    api_server_details: Optional[dict]
    components_status: Optional[dict]
    total_nodes: int
    ready_nodes: int
    nodes_status: Optional[list]
    system_pods_status: Optional[list]
    error_messages: Optional[list]
    warning_messages: Optional[list]
    checked_at: datetime
    check_duration_seconds: Optional[int]

    class Config:
        from_attributes = True


class ScheduleSettingsRequest(BaseModel):
    morning_time: Optional[str] = "09:00"  # HH:MM 형식
    morning_enabled: bool = True
    noon_time: Optional[str] = "13:00"
    noon_enabled: bool = True
    evening_time: Optional[str] = "18:00"
    evening_enabled: bool = True
    timezone: str = "Asia/Seoul"


class ScheduleSettingsResponse(BaseModel):
    id: UUID
    cluster_id: UUID
    is_active: bool
    morning_time: Optional[str]
    morning_enabled: bool
    noon_time: Optional[str]
    noon_enabled: bool
    evening_time: Optional[str]
    evening_enabled: bool
    timezone: str

    class Config:
        from_attributes = True


class ClusterSummary(BaseModel):
    cluster_id: UUID
    cluster_name: str
    latest_check: Optional[DailyCheckResponse]
    today_checks_count: int
    status: StatusEnum


# ============================================
# Endpoints
# ============================================

@router.post("/run/{cluster_id}", response_model=DailyCheckResponse)
async def run_daily_check(
    cluster_id: UUID,
    background_tasks: BackgroundTasks,
    schedule_type: CheckScheduleType = CheckScheduleType.manual,
    db: Session = Depends(get_db)
):
    """일일 체크 수동 실행"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    checker = DailyChecker(db)
    result = await checker.run_daily_check(str(cluster_id), schedule_type)

    return result


@router.get("/results/{cluster_id}", response_model=List[DailyCheckResponse])
async def get_check_results(
    cluster_id: UUID,
    limit: int = 10,
    offset: int = 0,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """체크 결과 조회"""
    query = db.query(DailyCheckLog).filter(DailyCheckLog.cluster_id == cluster_id)

    if date_from:
        query = query.filter(DailyCheckLog.check_date >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(DailyCheckLog.check_date <= datetime.combine(date_to, time.max))

    results = query.order_by(desc(DailyCheckLog.checked_at)).offset(offset).limit(limit).all()
    return results


@router.get("/results/{cluster_id}/latest", response_model=Optional[DailyCheckResponse])
async def get_latest_check_result(
    cluster_id: UUID,
    db: Session = Depends(get_db)
):
    """최신 체크 결과 조회"""
    result = db.query(DailyCheckLog).filter(
        DailyCheckLog.cluster_id == cluster_id
    ).order_by(desc(DailyCheckLog.checked_at)).first()

    if not result:
        raise HTTPException(status_code=404, detail="No check results found")

    return result


@router.get("/summary", response_model=List[ClusterSummary])
async def get_all_clusters_summary(db: Session = Depends(get_db)):
    """전체 클러스터 요약 (대시보드용)"""
    clusters = db.query(Cluster).all()
    summaries = []

    today_start = datetime.combine(date.today(), time.min)

    for cluster in clusters:
        # 최신 체크 결과
        latest = db.query(DailyCheckLog).filter(
            DailyCheckLog.cluster_id == cluster.id
        ).order_by(desc(DailyCheckLog.checked_at)).first()

        # 오늘 체크 횟수
        today_count = db.query(DailyCheckLog).filter(
            DailyCheckLog.cluster_id == cluster.id,
            DailyCheckLog.checked_at >= today_start
        ).count()

        summaries.append(ClusterSummary(
            cluster_id=cluster.id,
            cluster_name=cluster.name,
            latest_check=latest,
            today_checks_count=today_count,
            status=cluster.status
        ))

    return summaries


@router.get("/schedule/{cluster_id}", response_model=ScheduleSettingsResponse)
async def get_schedule_settings(
    cluster_id: UUID,
    db: Session = Depends(get_db)
):
    """스케줄 설정 조회"""
    schedule = db.query(CheckSchedule).filter(
        CheckSchedule.cluster_id == cluster_id
    ).first()

    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    return _schedule_to_response(schedule)


@router.put("/schedule/{cluster_id}", response_model=ScheduleSettingsResponse)
async def update_schedule_settings(
    cluster_id: UUID,
    settings: ScheduleSettingsRequest,
    db: Session = Depends(get_db)
):
    """스케줄 설정 업데이트"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    schedule = db.query(CheckSchedule).filter(
        CheckSchedule.cluster_id == cluster_id
    ).first()

    if not schedule:
        schedule = CheckSchedule(cluster_id=cluster_id)
        db.add(schedule)

    # 시간 파싱 및 설정
    if settings.morning_time:
        h, m = map(int, settings.morning_time.split(":"))
        schedule.morning_time = time(h, m)
    schedule.morning_enabled = settings.morning_enabled

    if settings.noon_time:
        h, m = map(int, settings.noon_time.split(":"))
        schedule.noon_time = time(h, m)
    schedule.noon_enabled = settings.noon_enabled

    if settings.evening_time:
        h, m = map(int, settings.evening_time.split(":"))
        schedule.evening_time = time(h, m)
    schedule.evening_enabled = settings.evening_enabled

    schedule.timezone = settings.timezone
    schedule.is_active = True

    db.commit()
    db.refresh(schedule)

    return _schedule_to_response(schedule)


def _schedule_to_response(schedule: CheckSchedule) -> ScheduleSettingsResponse:
    """Schedule 모델을 Response로 변환"""
    return ScheduleSettingsResponse(
        id=schedule.id,
        cluster_id=schedule.cluster_id,
        is_active=schedule.is_active,
        morning_time=schedule.morning_time.strftime("%H:%M") if schedule.morning_time else None,
        morning_enabled=schedule.morning_enabled,
        noon_time=schedule.noon_time.strftime("%H:%M") if schedule.noon_time else None,
        noon_enabled=schedule.noon_enabled,
        evening_time=schedule.evening_time.strftime("%H:%M") if schedule.evening_time else None,
        evening_enabled=schedule.evening_enabled,
        timezone=schedule.timezone
    )
