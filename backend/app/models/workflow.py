import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, Float, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    steps = relationship(
        "WorkflowStep",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowStep.order_index",
    )
    edges = relationship("WorkflowEdge", back_populates="workflow", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Workflow(title={self.title})>"


class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    completed = Column(Boolean, default=False)
    step_type = Column(String(50), default='action', nullable=False)
    status = Column(String(20), default='idle', nullable=False)
    pos_x = Column(Float, default=100.0)
    pos_y = Column(Float, default=100.0)
    order_index = Column(Integer, default=0)
    # 다른 게시판 항목과의 연계 (워크플로 노드 연결)
    reference_type = Column(String(50), nullable=True)   # cluster / playbook / issue / task / work_guide / metric_card
    reference_id = Column(String(100), nullable=True)    # 참조 항목의 UUID
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workflow = relationship("Workflow", back_populates="steps")

    def __repr__(self):
        return f"<WorkflowStep(title={self.title}, completed={self.completed})>"


class WorkflowEdge(Base):
    __tablename__ = "workflow_edges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id = Column(UUID(as_uuid=True), ForeignKey("workflows.id"), nullable=False)
    source_step_id = Column(UUID(as_uuid=True), ForeignKey("workflow_steps.id", ondelete="CASCADE"), nullable=False)
    target_step_id = Column(UUID(as_uuid=True), ForeignKey("workflow_steps.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    workflow = relationship("Workflow", back_populates="edges")
    source_step = relationship("WorkflowStep", foreign_keys=[source_step_id])
    target_step = relationship("WorkflowStep", foreign_keys=[target_step_id])

    def __repr__(self):
        return f"<WorkflowEdge({self.source_step_id} → {self.target_step_id})>"
