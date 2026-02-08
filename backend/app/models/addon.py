import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.cluster import StatusEnum


class Addon(Base):
    __tablename__ = "addons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=False)
    name = Column(String(50), nullable=False)
    type = Column(String(50), nullable=False)
    icon = Column(String(10), default="📦")
    description = Column(String(255), nullable=True)
    check_playbook = Column(String(100), nullable=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.healthy)
    response_time = Column(Integer, nullable=True)  # milliseconds
    details = Column(JSONB, nullable=True)
    config = Column(JSONB, nullable=True)  # tool-specific settings (url, token, namespace, etc.)
    last_check = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cluster = relationship("Cluster", back_populates="addons")
    check_logs = relationship("CheckLog", back_populates="addon", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Addon(name={self.name}, status={self.status})>"
