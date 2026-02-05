from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional
from enum import Enum


class StatusEnum(str, Enum):
    healthy = "healthy"
    warning = "warning"
    critical = "critical"


class ClusterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    api_endpoint: str = Field(..., min_length=1, max_length=255)
    kubeconfig_path: Optional[str] = None


class ClusterCreate(ClusterBase):
    pass


class ClusterUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    api_endpoint: Optional[str] = Field(None, min_length=1, max_length=255)
    kubeconfig_path: Optional[str] = None
    status: Optional[StatusEnum] = None


class ClusterResponse(ClusterBase):
    id: UUID
    status: StatusEnum
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClusterListResponse(BaseModel):
    data: list[ClusterResponse]
