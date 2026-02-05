import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Integer, Boolean, Time
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.cluster import StatusEnum
import enum


class CheckScheduleType(str, enum.Enum):
    morning = "morning"      # 아침
    noon = "noon"            # 점심
    evening = "evening"      # 저녁
    manual = "manual"        # 수동


class DailyCheckLog(Base):
    """일일 정기 체크 로그 - 하루 3번 (아침/점심/저녁) 체크 결과 저장"""
    __tablename__ = "daily_check_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=False)

    # 체크 스케줄 타입
    schedule_type = Column(Enum(CheckScheduleType), nullable=False)
    check_date = Column(DateTime, nullable=False)  # 체크 날짜

    # 전체 상태
    overall_status = Column(Enum(StatusEnum), nullable=False)

    # API 서버 상태
    api_server_status = Column(Enum(StatusEnum), nullable=False)
    api_server_response_time_ms = Column(Integer, nullable=True)
    api_server_details = Column(JSONB, nullable=True)  # /healthz, /livez, /readyz 결과

    # 컴포넌트 상태 (etcd, scheduler, controller-manager)
    components_status = Column(JSONB, nullable=True)
    # 예: {"etcd": {"status": "healthy", "message": "..."}, "scheduler": {...}}

    # 노드 정보
    nodes_status = Column(JSONB, nullable=True)
    # 예: [{"name": "node1", "status": "Ready", "cpu": "4", "memory": "8Gi", ...}]
    total_nodes = Column(Integer, default=0)
    ready_nodes = Column(Integer, default=0)

    # 시스템 파드 정보
    system_pods_status = Column(JSONB, nullable=True)
    # 예: [{"namespace": "kube-system", "name": "coredns-xxx", "status": "Running", ...}]

    # 리소스 사용량 요약
    resource_summary = Column(JSONB, nullable=True)
    # 예: {"cpu_requests": "2000m", "cpu_limits": "4000m", "memory_requests": "4Gi", ...}

    # 에러/경고 메시지
    error_messages = Column(JSONB, nullable=True)
    warning_messages = Column(JSONB, nullable=True)

    # 메타 정보
    checked_at = Column(DateTime, default=datetime.utcnow)
    check_duration_seconds = Column(Integer, nullable=True)

    # Relationships
    cluster = relationship("Cluster", backref="daily_check_logs")

    def __repr__(self):
        return f"<DailyCheckLog(cluster_id={self.cluster_id}, schedule={self.schedule_type}, status={self.overall_status})>"


class CheckSchedule(Base):
    """체크 스케줄 설정"""
    __tablename__ = "check_schedules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=False)

    # 스케줄 활성화 여부
    is_active = Column(Boolean, default=True)

    # 아침 체크 시간 (예: 09:00)
    morning_time = Column(Time, nullable=True)
    morning_enabled = Column(Boolean, default=True)

    # 점심 체크 시간 (예: 13:00)
    noon_time = Column(Time, nullable=True)
    noon_enabled = Column(Boolean, default=True)

    # 저녁 체크 시간 (예: 18:00)
    evening_time = Column(Time, nullable=True)
    evening_enabled = Column(Boolean, default=True)

    # 타임존
    timezone = Column(String(50), default="Asia/Seoul")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cluster = relationship("Cluster", backref="check_schedule")

    def __repr__(self):
        return f"<CheckSchedule(cluster_id={self.cluster_id}, active={self.is_active})>"
