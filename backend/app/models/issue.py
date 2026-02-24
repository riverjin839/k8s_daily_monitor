import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Issue(Base):
    __tablename__ = "issues"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignee = Column(String(100), nullable=False)               # 담당자
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=True)  # 대상 클러스터 (optional)
    cluster_name = Column(String(100), nullable=True)            # 클러스터 이름 (비정규화 — 삭제된 클러스터도 보관)
    issue_area = Column(String(100), nullable=False)             # 이슈 부분
    issue_content = Column(Text, nullable=False)                 # 이슈 내용
    action_content = Column(Text, nullable=True)                 # 조치 내용
    occurred_at = Column(Date, nullable=False)                   # 이슈 발생일
    resolved_at = Column(Date, nullable=True)                    # 이슈 조치일
    remarks = Column(Text, nullable=True)                        # 비고
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship (nullable FK — issue survives cluster deletion)
    cluster = relationship("Cluster", back_populates="issues", foreign_keys=[cluster_id])

    def __repr__(self):
        return f"<Issue(assignee={self.assignee}, area={self.issue_area})>"
