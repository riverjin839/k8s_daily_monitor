from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


Importance = Literal["info", "low", "medium", "high", "critical"]


class CommandEntryBase(BaseModel):
    category: Optional[str] = Field(default=None, max_length=50)
    command: str = Field(..., min_length=1)
    description: Optional[str] = None
    caution: Optional[str] = None
    importance: Importance = "medium"
    examples: Optional[str] = None
    tags: Optional[str] = Field(default=None, max_length=255)
    pinned: bool = False
    sort_order: int = 1000
    author: Optional[str] = Field(default=None, max_length=100)
    confluence_url: Optional[str] = Field(default=None, max_length=2048)


class CommandEntryCreate(CommandEntryBase):
    pass


class CommandEntryUpdate(BaseModel):
    category: Optional[str] = Field(default=None, max_length=50)
    command: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    caution: Optional[str] = None
    importance: Optional[Importance] = None
    examples: Optional[str] = None
    tags: Optional[str] = Field(default=None, max_length=255)
    pinned: Optional[bool] = None
    sort_order: Optional[int] = None
    author: Optional[str] = Field(default=None, max_length=100)
    confluence_url: Optional[str] = Field(default=None, max_length=2048)


class CommandEntryResponse(CommandEntryBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommandEntryListResponse(BaseModel):
    data: list[CommandEntryResponse]
    total: int
