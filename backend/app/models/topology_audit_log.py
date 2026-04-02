import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.database import Base


class TopologyAuditLog(Base):
    __tablename__ = "topology_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="CASCADE"), nullable=False)
    entity_type = Column(String(20), nullable=False)  # node|port|link
    entity_id = Column(String(100), nullable=True)
    action = Column(String(30), nullable=False)  # create|update|delete|sync|force_fix
    scope = Column(String(20), nullable=False)  # read|edit|sync|force_fix
    status = Column(String(20), nullable=False, default="success")  # success|partial|failed
    reason = Column(Text, nullable=True)
    before_data = Column(JSONB, nullable=True)
    after_data = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
