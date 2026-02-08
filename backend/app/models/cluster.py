import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class StatusEnum(str, enum.Enum):
    healthy = "healthy"
    warning = "warning"
    critical = "critical"


class Cluster(Base):
    __tablename__ = "clusters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    api_endpoint = Column(String(255), nullable=False)
    kubeconfig_path = Column(String(255), nullable=True)
    status = Column(Enum(StatusEnum), default=StatusEnum.healthy)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    addons = relationship("Addon", back_populates="cluster", cascade="all, delete-orphan")
    check_logs = relationship("CheckLog", back_populates="cluster", cascade="all, delete-orphan")
    playbooks = relationship("Playbook", back_populates="cluster", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Cluster(name={self.name}, status={self.status})>"
