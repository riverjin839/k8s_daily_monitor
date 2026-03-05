from datetime import datetime
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
    scheduled_at: datetime
    completed_at: Optional[datetime] = None
    priority: str = Field(default="medium", pattern="^(high|medium|low)$")
    remarks: Optional[str] = None
    # 칸반 보드 필드
    kanban_status: str = Field(default="todo", pattern="^(backlog|todo|in_progress|review_test|done)$")
    module: Optional[str] = Field(None, pattern="^(k8s|keycloak|nexus|cilium|argocd|jenkins|backend|frontend|monitoring|infra)$")
    type_label: Optional[str] = Field(None, pattern="^(feature|bug|chore|docs|security)$")
    effort_hours: Optional[int] = Field(None, ge=1, le=999)
    done_condition: Optional[str] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    assignee: Optional[str] = Field(None, min_length=1, max_length=100)
    cluster_id: Optional[UUID] = None
    cluster_name: Optional[str] = Field(None, max_length=100)
    task_category: Optional[str] = Field(None, min_length=1, max_length=100)
    task_content: Optional[str] = Field(None, min_length=1)
    result_content: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    priority: Optional[str] = Field(None, pattern="^(high|medium|low)$")
    remarks: Optional[str] = None
    kanban_status: Optional[str] = Field(None, pattern="^(backlog|todo|in_progress|review_test|done)$")
    module: Optional[str] = Field(None, pattern="^(k8s|keycloak|nexus|cilium|argocd|jenkins|backend|frontend|monitoring|infra)$")
    type_label: Optional[str] = Field(None, pattern="^(feature|bug|chore|docs|security)$")
    effort_hours: Optional[int] = Field(None, ge=1, le=999)
    done_condition: Optional[str] = None


class TaskStatusPatch(BaseModel):
    """칸반 컬럼 이동 전용 스키마 (PATCH /tasks/{id}/status)"""
    kanban_status: str = Field(..., pattern="^(backlog|todo|in_progress|review_test|done)$")


class TaskResponse(TaskBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskStatusResponse(BaseModel):
    """칸반 상태 변경 응답 — WIP 초과 경고 포함"""
    data: TaskResponse
    wip_warning: bool = False


class TaskListResponse(BaseModel):
    data: list[TaskResponse]
    total: int
