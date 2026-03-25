import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey
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
    scheduled_at = Column(DateTime, nullable=False)              # 작업 예정일시
    completed_at = Column(DateTime, nullable=True)               # 작업 완료일시
    priority = Column(String(20), nullable=False, default="medium")  # high / medium / low
    remarks = Column(Text, nullable=True)                        # 비고
    # 칸반 보드 필드
    kanban_status = Column(String(20), nullable=False, default="todo")  # backlog/todo/in_progress/review_test/done
    module = Column(String(50), nullable=True)    # k8s/keycloak/nexus/cilium/argocd/jenkins/backend/frontend/monitoring/infra
    type_label = Column(String(20), nullable=True)  # feature/bug/chore/docs/security
    effort_hours = Column(Integer, nullable=True)   # 예상 소요 시간 (h)
    done_condition = Column(Text, nullable=True)    # 완료 조건
    parent_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cluster = relationship("Cluster", back_populates="tasks", foreign_keys=[cluster_id])
    subtasks = relationship("Task", back_populates="parent", foreign_keys="Task.parent_id", cascade="all, delete-orphan")
    parent = relationship("Task", back_populates="subtasks", foreign_keys="Task.parent_id", remote_side="Task.id")

    def __repr__(self):
        return f"<Task(assignee={self.assignee}, category={self.task_category})>"
