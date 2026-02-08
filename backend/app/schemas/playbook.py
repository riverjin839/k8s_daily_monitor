from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, Field


class PlaybookBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    playbook_path: str = Field(..., min_length=1, max_length=500)
    inventory_path: Optional[str] = None
    extra_vars: Optional[dict[str, Any]] = None
    tags: Optional[str] = None


class PlaybookCreate(PlaybookBase):
    cluster_id: UUID


class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    playbook_path: Optional[str] = None
    inventory_path: Optional[str] = None
    extra_vars: Optional[dict[str, Any]] = None
    tags: Optional[str] = None


class PlaybookResponse(PlaybookBase):
    id: UUID
    cluster_id: UUID
    status: str = "unknown"
    last_run_at: Optional[datetime] = None
    last_result: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PlaybookListResponse(BaseModel):
    data: list[PlaybookResponse]


class PlaybookRunResponse(BaseModel):
    id: UUID
    status: str
    message: str
    stats: Optional[dict[str, Any]] = None
    duration_ms: int = 0
