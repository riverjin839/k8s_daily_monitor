from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional


class ManagementServerBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    host: str = Field(..., min_length=1, max_length=255)
    port: Optional[int] = 22
    username: Optional[str] = None
    server_type: Optional[str] = 'jump_host'
    description: Optional[str] = None
    region: Optional[str] = None
    tags: Optional[str] = None
    os_info: Optional[str] = None


class ManagementServerCreate(ManagementServerBase):
    pass


class ManagementServerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    host: Optional[str] = Field(None, min_length=1, max_length=255)
    port: Optional[int] = None
    username: Optional[str] = None
    server_type: Optional[str] = None
    description: Optional[str] = None
    region: Optional[str] = None
    tags: Optional[str] = None
    os_info: Optional[str] = None
    status: Optional[str] = None


class ManagementServerResponse(ManagementServerBase):
    id: UUID
    status: str
    last_checked: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ManagementServerListResponse(BaseModel):
    data: list[ManagementServerResponse]
