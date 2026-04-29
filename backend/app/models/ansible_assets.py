"""Ansible Playbook 파일/인벤토리 — DB에 자체 관리.

`Playbook` (실행 단위) 가 더이상 `playbook_path`/`inventory_path` 에 직접 의존하지
않도록, 두 종류의 신규 엔티티를 도입한다.

- ``AnsiblePlaybookFile`` — Playbook YAML 본문을 DB 에 보관하는 **공용** 라이브러리.
  cluster_id 가 없다(어느 클러스터든 재사용 가능).
- ``AnsibleInventory`` — Inventory 본문(INI/YAML) 을 DB 에 보관. 한 클러스터에
  여러 개를 등록할 수 있다(예: prod / dr / 일부 노드만).
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class AnsiblePlaybookFile(Base):
    """Cluster 와 무관하게 공유되는 Ansible Playbook YAML 라이브러리."""

    __tablename__ = "ansible_playbook_files"
    __table_args__ = (UniqueConstraint("name", name="uq_ansible_playbook_files_name"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(150), nullable=False)
    description = Column(String(500), nullable=True)
    content = Column(Text, nullable=False)            # Playbook YAML 본문
    tags = Column(String(255), nullable=True)         # default --tags 힌트(선택)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AnsiblePlaybookFile(name={self.name})>"


class AnsibleInventory(Base):
    """Cluster 별 Inventory. 한 클러스터에 여러 개 등록 가능."""

    __tablename__ = "ansible_inventories"
    __table_args__ = (
        UniqueConstraint("cluster_id", "name", name="uq_ansible_inventories_cluster_name"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id"), nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(String(500), nullable=True)
    content = Column(Text, nullable=False)            # Inventory 본문 (INI 또는 YAML)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cluster = relationship("Cluster")

    def __repr__(self) -> str:
        return f"<AnsibleInventory(cluster={self.cluster_id}, name={self.name})>"
