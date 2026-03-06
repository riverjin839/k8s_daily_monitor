from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List


class WorkGuideCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: Optional[str] = None
    category: Optional[str] = None
    priority: str = 'medium'
    tags: Optional[str] = None
    status: str = 'draft'
    author: Optional[str] = None
    parent_id: Optional[UUID] = None
    sort_order: int = 0


class WorkGuideUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = None
    author: Optional[str] = None
    parent_id: Optional[UUID] = None
    sort_order: Optional[int] = None


class WorkGuideResponse(BaseModel):
    id: UUID
    parent_id: Optional[UUID] = None
    title: str
    content: Optional[str] = None
    category: Optional[str] = None
    priority: str
    tags: Optional[str] = None
    status: str
    author: Optional[str] = None
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkGuideListResponse(BaseModel):
    data: List[WorkGuideResponse]
