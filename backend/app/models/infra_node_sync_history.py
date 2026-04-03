import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class InfraNodeSyncHistory(Base):
    __tablename__ = "infra_node_sync_histories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="CASCADE"), nullable=False)
    node_id = Column(UUID(as_uuid=True), ForeignKey("infra_nodes.id", ondelete="SET NULL"), nullable=True)
    sync_type = Column(String(30), nullable=False)  # node_sync | topology_sync
    source = Column(String(30), nullable=False)  # k8s | lldp_cdp | cmdb | manual
    action = Column(String(20), nullable=False)  # created | updated | deleted | conflict | no_change
    confidence = Column(Integer, nullable=False, default=50)
    priority = Column(Integer, nullable=False, default=50)
    message = Column(Text, nullable=True)
    before_data = Column(JSON, nullable=True)
    after_data = Column(JSON, nullable=True)
    conflict_fields = Column(JSON, nullable=True)
    synced_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    cluster = relationship("Cluster")
    infra_node = relationship("InfraNode")
