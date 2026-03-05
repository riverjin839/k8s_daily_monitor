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


class WorkGuideUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = None
    author: Optional[str] = None


class WorkGuideResponse(BaseModel):
    id: UUID
    title: str
    content: Optional[str] = None
    category: Optional[str] = None
    priority: str
    tags: Optional[str] = None
    status: str
    author: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkGuideListResponse(BaseModel):
    data: List[WorkGuideResponse]
