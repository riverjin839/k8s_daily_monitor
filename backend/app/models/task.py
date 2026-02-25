import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignee = Column(String(100), nullable=False)               # 담당자
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=True)
    cluster_name = Column(String(100), nullable=True)            # 비정규화
    task_category = Column(String(100), nullable=False)          # 작업 분류
    task_content = Column(Text, nullable=False)                  # 작업 내용
    result_content = Column(Text, nullable=True)                 # 작업 결과
    scheduled_at = Column(Date, nullable=False)                  # 작업 예정일
    completed_at = Column(Date, nullable=True)                   # 작업 완료일
    priority = Column(String(20), nullable=False, default="medium")  # high / medium / low
    remarks = Column(Text, nullable=True)                        # 비고
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cluster = relationship("Cluster", back_populates="tasks", foreign_keys=[cluster_id])

    def __repr__(self):
        return f"<Task(assignee={self.assignee}, category={self.task_category})>"
