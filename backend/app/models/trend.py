import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, DateTime, Date, Boolean, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class TrendSource(Base):
    __tablename__ = "trend_sources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)           # "kubernetes", "cilium", "linux"
    source_type = Column(String(20), nullable=False)     # "github_release", "rss"
    url = Column(String(500), nullable=False)            # repo slug or feed URL
    category = Column(String(50), nullable=False)        # "k8s", "cilium", "linux", "cncf"
    enabled = Column(Boolean, default=True)
    # 최근 수집 로그 — UI 에서 왜 수집 안 되는지 바로 보이게
    last_status = Column(String(20), nullable=True)      # "ok", "error", "empty"
    last_message = Column(Text, nullable=True)           # 에러 메시지 혹은 "N개 수집"
    last_item_count = Column(Integer, default=0)
    last_collected_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("TrendItem", back_populates="source", cascade="all, delete-orphan")


class TrendItem(Base):
    __tablename__ = "trend_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(UUID(as_uuid=True), ForeignKey("trend_sources.id"), nullable=False)
    title = Column(String(500), nullable=False)
    url = Column(String(500), nullable=False)
    published_at = Column(DateTime, nullable=False)
    raw_content = Column(Text, nullable=True)
    summary_ko = Column(Text, nullable=True)             # Ollama 한국어 요약
    version = Column(String(50), nullable=True)          # releases: "v1.32.0"
    item_type = Column(String(20), nullable=False)       # "release", "blog", "news"
    digest_date = Column(Date, nullable=False)
    collected_at = Column(DateTime, default=datetime.utcnow)

    source = relationship("TrendSource", back_populates="items")


class TrendDigest(Base):
    __tablename__ = "trend_digests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    digest_date = Column(Date, nullable=False, unique=True)
    overall_summary_ko = Column(Text, nullable=True)
    item_count = Column(Integer, default=0)
    status = Column(String(20), default="pending")       # pending/collecting/summarizing/done/failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
