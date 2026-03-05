import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class WorkGuide(Base):
    __tablename__ = "work_guides"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)
    category = Column(String(50), nullable=True)   # 배포, 트러블슈팅, 모니터링, 보안, 기타
    priority = Column(String(20), default='medium')  # high / medium / low
    tags = Column(String(500), nullable=True)        # 쉼표 구분
    status = Column(String(20), default='draft')     # draft / active / archived
    author = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<WorkGuide(title={self.title})>"
