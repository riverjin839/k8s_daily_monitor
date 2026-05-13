import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer
from app.database import Base


class CommandEntry(Base):
    """주요 명령어 / 파라미터 모음 — 운영자가 자주 참조하는 CLI 한 줄을 의미·주의사항·중요도와 함께 기록.

    파괴적 명령(rm -rf, drop, --force 등)은 importance=critical 로 분류해 시각적으로 구분한다.
    """
    __tablename__ = "command_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 분류 — kubectl / helm / docker / linux / git / etcdctl / ansible / 자유 문자열
    category = Column(String(50), nullable=True)
    # CLI 한 줄 또는 여러 줄 — 그대로 복사해 붙일 수 있는 형태가 권장
    command = Column(Text, nullable=False)
    # 의미 / 무엇을 하는지
    description = Column(Text, nullable=True)
    # 주의사항 / 부작용 / 권한 / 클러스터 영향 등
    caution = Column(Text, nullable=True)
    # info / low / medium / high / critical — 색상 매핑은 프론트가 담당
    importance = Column(String(20), nullable=False, default="medium")
    # 예시 / 실제 적용 예 (선택)
    examples = Column(Text, nullable=True)
    # 쉼표 구분 태그 — 검색용
    tags = Column(String(255), nullable=True)
    # 상단 고정
    pinned = Column(Boolean, nullable=False, default=False)
    # 수동 정렬 — 동일 importance / pinned 안에서 정렬 키
    sort_order = Column(Integer, nullable=False, default=1000)
    author = Column(String(100), nullable=True)
    # Confluence 문서 링크 (선택)
    confluence_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<CommandEntry(category={self.category}, importance={self.importance}, command={self.command[:40] if self.command else ''})>"
