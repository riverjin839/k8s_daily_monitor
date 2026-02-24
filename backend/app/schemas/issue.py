from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class IssueBase(BaseModel):
    assignee: str = Field(..., min_length=1, max_length=100)
    cluster_id: Optional[UUID] = None
    cluster_name: Optional[str] = Field(None, max_length=100)
    issue_area: str = Field(..., min_length=1, max_length=100)
    issue_content: str = Field(..., min_length=1)
    action_content: Optional[str] = None
    occurred_at: date
    resolved_at: Optional[date] = None
    remarks: Optional[str] = None


class IssueCreate(IssueBase):
    pass


class IssueUpdate(BaseModel):
    assignee: Optional[str] = Field(None, min_length=1, max_length=100)
    cluster_id: Optional[UUID] = None
    cluster_name: Optional[str] = Field(None, max_length=100)
    issue_area: Optional[str] = Field(None, min_length=1, max_length=100)
    issue_content: Optional[str] = Field(None, min_length=1)
    action_content: Optional[str] = None
    occurred_at: Optional[date] = None
    resolved_at: Optional[date] = None
    remarks: Optional[str] = None


class IssueResponse(IssueBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IssueListResponse(BaseModel):
    data: list[IssueResponse]
    total: int
