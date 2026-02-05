import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.cluster import StatusEnum


class CheckLog(Base):
    __tablename__ = "check_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=False)
    addon_id = Column(UUID(as_uuid=True), ForeignKey("addons.id"), nullable=True)
    status = Column(Enum(StatusEnum), nullable=False)
    message = Column(Text, nullable=False)
    raw_output = Column(JSONB, nullable=True)
    checked_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    cluster = relationship("Cluster", back_populates="check_logs")
    addon = relationship("Addon", back_populates="check_logs")

    def __repr__(self):
        return f"<CheckLog(status={self.status}, checked_at={self.checked_at})>"
