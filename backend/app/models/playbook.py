import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Playbook(Base):
    __tablename__ = "playbooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    # 신 모델: DB 에 저장된 Playbook 파일/Inventory 를 참조 (선택)
    playbook_file_id = Column(
        UUID(as_uuid=True), ForeignKey("ansible_playbook_files.id"), nullable=True,
    )
    inventory_id = Column(
        UUID(as_uuid=True), ForeignKey("ansible_inventories.id"), nullable=True,
    )
    # 구 모델: 실행호스트 경로 직접 지정 — 기존 데이터 호환을 위해 유지(둘 다 nullable).
    playbook_path = Column(String(500), nullable=True)   # path on execution host
    inventory_path = Column(String(500), nullable=True)  # optional inventory override
    extra_vars = Column(JSONB, nullable=True)            # --extra-vars JSON
    tags = Column(String(255), nullable=True)            # --tags filter
    status = Column(String(20), default="unknown")       # healthy/warning/critical/unknown/running
    show_on_dashboard = Column(Boolean, default=False)   # Dashboard 카드 표시 여부
    last_run_at = Column(DateTime, nullable=True)
    last_result = Column(JSONB, nullable=True)           # parsed ansible JSON callback output
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    cluster = relationship("Cluster", back_populates="playbooks")
    playbook_file = relationship("AnsiblePlaybookFile", lazy="joined")
    inventory = relationship("AnsibleInventory", lazy="joined")

    def __repr__(self):
        return f"<Playbook(name={self.name}, status={self.status})>"
