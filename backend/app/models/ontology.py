import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class OntologyEntityType(str, enum.Enum):
    node = "node"
    hardware = "hardware"
    os = "os"
    kernel_param = "kernel_param"
    network = "network"
    k8s_component = "k8s_component"
    cilium_component = "cilium_component"
    workload = "workload"
    service = "service"
    config_item = "config_item"


class OntologyEntity(Base):
    __tablename__ = "ontology_entities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="CASCADE"), nullable=False)
    entity_type = Column(Enum(OntologyEntityType), nullable=False)
    name = Column(String(255), nullable=False)
    external_id = Column(String(255), nullable=True)
    version = Column(String(100), nullable=True)
    properties = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_ontology_entities_cluster_type_name", "cluster_id", "entity_type", "name"),
    )


class OntologyRelationship(Base):
    __tablename__ = "ontology_relationships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="CASCADE"), nullable=False)
    source_entity_id = Column(UUID(as_uuid=True), ForeignKey("ontology_entities.id", ondelete="CASCADE"), nullable=False)
    relation_type = Column(String(50), nullable=False)
    target_entity_id = Column(UUID(as_uuid=True), ForeignKey("ontology_entities.id", ondelete="CASCADE"), nullable=False)
    weight = Column(Float, nullable=False, default=1.0)
    relation_metadata = Column("metadata", JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_ontology_relationships_cluster_source", "cluster_id", "source_entity_id"),
        Index("ix_ontology_relationships_cluster_target", "cluster_id", "target_entity_id"),
    )


class OntologyEvent(Base):
    __tablename__ = "ontology_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cluster_id = Column(UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False, default="warning")
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    evidence = Column(JSONB, nullable=False, default=dict)
    blast_radius_score = Column(Float, nullable=False, default=0.0)
    impacted_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
