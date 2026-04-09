from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class OntologyEntityCreate(BaseModel):
    cluster_id: UUID
    entity_type: str
    name: str = Field(..., min_length=1, max_length=255)
    external_id: str | None = Field(default=None, max_length=255)
    version: str | None = Field(default=None, max_length=100)
    properties: dict = Field(default_factory=dict)


class OntologyEntityRead(BaseModel):
    id: UUID
    cluster_id: UUID
    entity_type: str
    name: str
    external_id: str | None = None
    version: str | None = None
    properties: dict
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OntologyRelationshipCreate(BaseModel):
    cluster_id: UUID
    source_entity_id: UUID
    relation_type: str = Field(..., min_length=2, max_length=50)
    target_entity_id: UUID
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    relation_metadata: dict = Field(default_factory=dict)


class OntologyRelationshipRead(BaseModel):
    id: UUID
    cluster_id: UUID
    source_entity_id: UUID
    relation_type: str
    target_entity_id: UUID
    weight: float
    relation_metadata: dict
    created_at: datetime

    class Config:
        from_attributes = True


class ConfigChangeImpactRequest(BaseModel):
    cluster_id: UUID
    config_entity_id: UUID
    category: str = Field(..., min_length=2, max_length=50)
    severity: str = Field(default="warning", pattern="^(info|warning|critical)$")
    title: str = Field(..., min_length=2, max_length=255)
    description: str | None = None
    evidence: dict = Field(default_factory=dict)
    max_depth: int = Field(default=4, ge=1, le=8)


class ImpactPath(BaseModel):
    path: list[UUID]
    path_names: list[str]
    path_relations: list[str]
    score: float


class ConfigChangeImpactResponse(BaseModel):
    event_id: UUID
    blast_radius_score: float
    impacted_entities: list[OntologyEntityRead]
    impact_paths: list[ImpactPath]


class OntologyGraphResponse(BaseModel):
    cluster_id: UUID
    entities: list[OntologyEntityRead]
    relationships: list[OntologyRelationshipRead]
