import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class ManagementServer(Base):
    __tablename__ = "management_servers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    host = Column(String(255), nullable=False)             # IP 또는 호스트명
    port = Column(Integer, default=22)                      # SSH 포트
    username = Column(String(100), nullable=True)          # SSH 사용자명
    server_type = Column(String(50), default='jump_host')  # jump_host / admin / monitoring / cicd / bastion
    description = Column(Text, nullable=True)
    status = Column(String(20), default='unknown')          # online / offline / unknown
    region = Column(String(100), nullable=True)
    tags = Column(String(500), nullable=True)               # 쉼표 구분 태그
    os_info = Column(String(200), nullable=True)            # OS 정보
    last_checked = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ManagementServer(name={self.name}, host={self.host})>"
