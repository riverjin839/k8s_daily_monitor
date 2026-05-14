"""ServiceEntry — 주요 관리 서비스(k8s/keycloak/nexus/jenkins/argocd 등) 별로
히스토리·지식·트러블슈팅·링크를 한 곳에서 관리하기 위한 통합 모델.

설계 원칙:
 - 서비스 카탈로그(`service` 키)는 frontend 에서 정의(슬러그 단위) — 백엔드는 검증 안 함.
 - `kind` 로 항목 종류 구분: note / guide / troubleshoot / history / link.
 - cluster_id 는 optional — 특정 클러스터에 묶이거나 전역(공통 지식).
 - tags / pinned / author / severity 부가 메타.
"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class ServiceEntry(Base):
    __tablename__ = "service_entries"
    __table_args__ = (
        Index("ix_service_entries_service", "service"),
        Index("ix_service_entries_cluster_kind", "cluster_id", "kind"),
        Index("ix_service_entries_pinned_updated", "pinned", "updated_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # 서비스 슬러그 — 'k8s', 'keycloak', 'nexus', 'jenkins', 'argocd' 등
    service = Column(String(64), nullable=False)
    # 특정 클러스터에 한정된 항목인지 (NULL 이면 모든 클러스터에 공통)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="SET NULL"), nullable=True)
    # 항목 종류
    kind = Column(String(32), nullable=False, default="note")  # note / guide / troubleshoot / history / link
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False, default="")          # rich HTML or markdown
    # link 종류일 때 사용
    url = Column(String(2048), nullable=True)
    # troubleshoot / history 일 때 sev: critical / warning / info
    severity = Column(String(32), nullable=True)
    # 변경이력에서 "언제 발생했는가" — created_at 과 별도로 사용자가 입력 가능
    occurred_at = Column(DateTime, nullable=True)

    tags = Column(JSONB, nullable=True)             # ["upgrade", "1.30", "incident"]
    pinned = Column(Boolean, default=False, nullable=False)
    author = Column(String(64), nullable=True)
    # 자유 메타 (커스텀 필드 — 서비스/팀별로 자유롭게 활용)
    meta = Column(JSONB, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    cluster = relationship("Cluster", foreign_keys=[cluster_id])

    def __repr__(self):
        return f"<ServiceEntry(service={self.service}, kind={self.kind}, title={self.title})>"
