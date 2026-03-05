from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List


class WorkflowStepCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    completed: bool = False
    step_type: str = 'action'
    status: str = 'idle'
    pos_x: float = 100.0
    pos_y: float = 100.0
    order_index: int = 0
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None


class WorkflowStepUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    completed: Optional[bool] = None
    step_type: Optional[str] = None
    status: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    order_index: Optional[int] = None
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None


class WorkflowStepResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    title: str
    description: Optional[str] = None
    completed: bool
    step_type: str
    status: str
    pos_x: float
    pos_y: float
    order_index: int
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowEdgeCreate(BaseModel):
    source_step_id: UUID
    target_step_id: UUID


class WorkflowEdgeResponse(BaseModel):
    id: UUID
    workflow_id: UUID
    source_step_id: UUID
    target_step_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class WorkflowCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class WorkflowUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None


class WorkflowResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    steps: List[WorkflowStepResponse] = []
    edges: List[WorkflowEdgeResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkflowListResponse(BaseModel):
    data: List[WorkflowResponse]
