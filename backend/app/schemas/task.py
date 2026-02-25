from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class TaskBase(BaseModel):
    assignee: str = Field(..., min_length=1, max_length=100)
    cluster_id: Optional[UUID] = None
    cluster_name: Optional[str] = Field(None, max_length=100)
    task_category: str = Field(..., min_length=1, max_length=100)
    task_content: str = Field(..., min_length=1)
    result_content: Optional[str] = None
    scheduled_at: date
    completed_at: Optional[date] = None
    priority: str = Field(default="medium", pattern="^(high|medium|low)$")
    remarks: Optional[str] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    assignee: Optional[str] = Field(None, min_length=1, max_length=100)
    cluster_id: Optional[UUID] = None
    cluster_name: Optional[str] = Field(None, max_length=100)
    task_category: Optional[str] = Field(None, min_length=1, max_length=100)
    task_content: Optional[str] = Field(None, min_length=1)
    result_content: Optional[str] = None
    scheduled_at: Optional[date] = None
    completed_at: Optional[date] = None
    priority: Optional[str] = Field(None, pattern="^(high|medium|low)$")
    remarks: Optional[str] = None


class TaskResponse(TaskBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    data: list[TaskResponse]
    total: int
