from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


EntryKind = Literal["note", "guide", "troubleshoot", "history", "link"]


class ServiceEntryBase(BaseModel):
    service: str = Field(..., min_length=1, max_length=64)
    cluster_id: Optional[UUID] = None
    kind: EntryKind = "note"
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(default="")
    url: Optional[str] = Field(default=None, max_length=2048)
    severity: Optional[str] = Field(default=None, max_length=32)
    occurred_at: Optional[datetime] = None
    tags: Optional[list[str]] = None
    pinned: bool = False
    author: Optional[str] = Field(default=None, max_length=64)
    meta: Optional[dict[str, Any]] = None


class ServiceEntryCreate(ServiceEntryBase):
    pass


class ServiceEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    cluster_id: Optional[UUID] = None
    kind: Optional[EntryKind] = None
    title: Optional[str] = None
    content: Optional[str] = None
    url: Optional[str] = None
    severity: Optional[str] = None
    occurred_at: Optional[datetime] = None
    tags: Optional[list[str]] = None
    pinned: Optional[bool] = None
    author: Optional[str] = None
    meta: Optional[dict[str, Any]] = None


class ServiceEntryOut(ServiceEntryBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    cluster_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ServiceEntryList(BaseModel):
    data: list[ServiceEntryOut]
    total: int


class ServiceCatalogItem(BaseModel):
    service: str
    total: int
    by_kind: dict[str, int] = Field(default_factory=dict)
    last_updated: Optional[datetime] = None


class ServiceCatalogResponse(BaseModel):
    services: list[ServiceCatalogItem]
