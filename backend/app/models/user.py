import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Boolean

from app.database import Base


class User(Base):
    """Authentication subject. Distinct from `assignees` (which is a free-form
    JSON list of work owners and may exist without a corresponding User)."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(64), nullable=False, unique=True, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(16), nullable=False, default="user")  # 'admin' | 'user'
    display_name = Column(String(128), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
