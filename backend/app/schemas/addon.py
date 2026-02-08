from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, Dict, Any
from app.schemas.cluster import StatusEnum


class AddonBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    type: str = Field(..., min_length=1, max_length=50)
    icon: str = Field(default="📦", max_length=10)
    description: Optional[str] = None
    check_playbook: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class AddonCreate(AddonBase):
    cluster_id: UUID


class AddonUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    type: Optional[str] = Field(None, min_length=1, max_length=50)
    icon: Optional[str] = None
    description: Optional[str] = None
    check_playbook: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    status: Optional[StatusEnum] = None


class AddonResponse(AddonBase):
    id: UUID
    cluster_id: UUID
    status: StatusEnum
    response_time: Optional[int] = None
    last_check: datetime
    details: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class AddonListResponse(BaseModel):
    data: list[AddonResponse]
