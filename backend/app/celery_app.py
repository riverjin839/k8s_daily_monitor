"""
Celery 앱 설정 및 스케줄 태스크
- 일일 3회 (아침/점심/저녁) 자동 헬스 체크
"""
from celery import Celery
from celery.schedules import crontab
from datetime import datetime
import asyncio

from app.config import settings

# Celery 앱 생성
celery_app = Celery(
    "k8s_daily_monitor",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

# Celery 설정
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Seoul",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5분 타임아웃
)

# Beat 스케줄 설정 (일일 3회 체크)
celery_app.conf.beat_schedule = {
    # 아침 체크 (09:00 KST)
    "daily-check-morning": {
        "task": "app.celery_app.run_scheduled_check",
        "schedule": crontab(hour=9, minute=0),
        "args": ("morning",),
    },
    # 점심 체크 (13:00 KST)
    "daily-check-noon": {
        "task": "app.celery_app.run_scheduled_check",
        "schedule": crontab(hour=13, minute=0),
        "args": ("noon",),
    },
    # 저녁 체크 (18:00 KST)
    "daily-check-evening": {
        "task": "app.celery_app.run_scheduled_check",
        "schedule": crontab(hour=18, minute=0),
        "args": ("evening",),
    },
}


@celery_app.task(bind=True, name="app.celery_app.run_scheduled_check")
def run_scheduled_check(self, schedule_type: str):
    """
    스케줄된 일일 체크 실행
    모든 활성 클러스터에 대해 체크 수행
    """
    from app.database import SessionLocal
    from app.models import Cluster, CheckSchedule, CheckScheduleType
    from app.services.daily_checker import DailyChecker

    db = SessionLocal()

    try:
        # 스케줄 타입 매핑
        schedule_enum = CheckScheduleType(schedule_type)

        # 해당 시간대에 체크가 활성화된 클러스터 조회
        clusters = db.query(Cluster).all()

        results = []
        for cluster in clusters:
            # 스케줄 설정 확인
            schedule = db.query(CheckSchedule).filter(
                CheckSchedule.cluster_id == cluster.id,
                CheckSchedule.is_active == True
            ).first()

            # 스케줄이 없거나 해당 시간대가 비활성화면 스킵
            if schedule:
                if schedule_type == "morning" and not schedule.morning_enabled:
                    continue
                elif schedule_type == "noon" and not schedule.noon_enabled:
                    continue
                elif schedule_type == "evening" and not schedule.evening_enabled:
                    continue

            # 체크 실행
            checker = DailyChecker(db)
            try:
                # async 함수를 sync로 실행
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(
                    checker.run_daily_check(str(cluster.id), schedule_enum)
                )
                loop.close()

                results.append({
                    "cluster": cluster.name,
                    "status": result.overall_status.value,
                    "checked_at": result.checked_at.isoformat()
                })
            except Exception as e:
                results.append({
                    "cluster": cluster.name,
                    "error": str(e)
                })

        return {
            "schedule_type": schedule_type,
            "executed_at": datetime.now().isoformat(),
            "results": results
        }

    finally:
        db.close()


@celery_app.task(bind=True, name="app.celery_app.run_single_check")
def run_single_check(self, cluster_id: str):
    """단일 클러스터 체크 실행 (수동)"""
    from app.database import SessionLocal
    from app.models import CheckScheduleType
    from app.services.daily_checker import DailyChecker

    db = SessionLocal()

    try:
        checker = DailyChecker(db)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(
            checker.run_daily_check(cluster_id, CheckScheduleType.manual)
        )
        loop.close()

        return {
            "cluster_id": cluster_id,
            "status": result.overall_status.value,
            "api_server_status": result.api_server_status.value,
            "total_nodes": result.total_nodes,
            "ready_nodes": result.ready_nodes,
            "checked_at": result.checked_at.isoformat()
        }

    finally:
        db.close()
