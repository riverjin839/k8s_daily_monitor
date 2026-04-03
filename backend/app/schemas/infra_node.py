from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, Any


class InfraNodeBase(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=255)
    rack_name: Optional[str] = Field(None, max_length=100)
    ip_address: Optional[str] = Field(None, max_length=45)
    role: str = Field(default="worker", pattern="^(master|worker|storage|infra)$")
    cpu_cores: Optional[int] = Field(None, ge=1, le=9999)
    ram_gb: Optional[int] = Field(None, ge=1, le=99999)
    disk_gb: Optional[int] = Field(None, ge=1, le=9999999)
    os_info: Optional[str] = Field(None, max_length=200)
    switch_name: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class InfraNodeCreate(InfraNodeBase):
    cluster_id: UUID


class InfraNodeUpdate(BaseModel):
    hostname: Optional[str] = Field(None, min_length=1, max_length=255)
    rack_name: Optional[str] = Field(None, max_length=100)
    ip_address: Optional[str] = Field(None, max_length=45)
    role: Optional[str] = Field(None, pattern="^(master|worker|storage|infra)$")
    cpu_cores: Optional[int] = Field(None, ge=1, le=9999)
    ram_gb: Optional[int] = Field(None, ge=1, le=99999)
    disk_gb: Optional[int] = Field(None, ge=1, le=9999999)
    os_info: Optional[str] = Field(None, max_length=200)
    switch_name: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class InfraNodeResponse(InfraNodeBase):
    id: UUID
    cluster_id: UUID
    auto_synced: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InfraNodeListResponse(BaseModel):
    data: list[InfraNodeResponse]
    total: int


class TopologySyncSource(BaseModel):
    type: str = Field(..., pattern="^(lldp_cdp|cmdb|manual)$")
    payload: dict[str, Any] = Field(default_factory=dict)


class TopologySyncRequest(BaseModel):
    sources: list[TopologySyncSource] = Field(default_factory=list)
    delete_missing: bool = False


class SyncResult(BaseModel):
    created: int
    updated: int
    deleted: int = 0
    conflicts: int = 0
    total: int


class InfraNodeSyncHistoryResponse(BaseModel):
    id: UUID
    cluster_id: UUID
    node_id: Optional[UUID]
    sync_type: str
    source: str
    action: str
    confidence: int
    priority: int
    message: Optional[str]
    before_data: Optional[dict[str, Any]]
    after_data: Optional[dict[str, Any]]
    conflict_fields: Optional[list[str]]
    synced_at: datetime

    class Config:
        from_attributes = True


class InfraNodeSyncHistoryListResponse(BaseModel):
    data: list[InfraNodeSyncHistoryResponse]
    total: int
