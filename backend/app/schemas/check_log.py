from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional, Dict, Any
from app.schemas.cluster import StatusEnum


class CheckLogBase(BaseModel):
    status: StatusEnum
    message: str
    raw_output: Optional[Dict[str, Any]] = None


class CheckLogCreate(CheckLogBase):
    cluster_id: UUID
    addon_id: Optional[UUID] = None


class CheckLogResponse(CheckLogBase):
    id: UUID
    cluster_id: UUID
    cluster_name: str
    addon_id: Optional[UUID] = None
    addon_name: Optional[str] = None
    checked_at: datetime

    class Config:
        from_attributes = True


class CheckLogListResponse(BaseModel):
    data: list[CheckLogResponse]
    total: int
    page: int
    page_size: int


class SummaryStatsResponse(BaseModel):
    total_clusters: int
    healthy: int
    warning: int
    critical: int
