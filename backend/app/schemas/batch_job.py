from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BatchJobBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    job_type: str = Field(..., min_length=1, max_length=80)
    default_host: Optional[str] = None
    default_port: int = 22
    default_username: str = "root"
    params: Optional[dict[str, Any]] = None
    cron: Optional[str] = None
    enabled: bool = True


class BatchJobCreate(BatchJobBase):
    cluster_id: UUID


class BatchJobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_host: Optional[str] = None
    default_port: Optional[int] = None
    default_username: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    cron: Optional[str] = None
    enabled: Optional[bool] = None


class BatchJobResponse(BatchJobBase):
    id: UUID
    cluster_id: UUID
    last_status: str = "unknown"
    last_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BatchJobListResponse(BaseModel):
    data: list[BatchJobResponse]


class BatchJobRunRequest(BaseModel):
    """Per-execution credentials and overrides. Credentials are NOT persisted."""
    host: Optional[str] = Field(default=None, description="overrides default_host")
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    private_key: Optional[str] = None
    param_override: Optional[dict[str, Any]] = None
    timeout: int = Field(default=60, ge=1, le=600)


class BatchJobRunResponse(BaseModel):
    id: UUID
    job_id: UUID
    status: str
    trigger: str
    host: Optional[str] = None
    executed_command: Optional[str] = None
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    error: Optional[str] = None
    duration_ms: int = 0
    started_at: datetime
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BatchJobRunListResponse(BaseModel):
    data: list[BatchJobRunResponse]


class BatchJobTypeDescriptor(BaseModel):
    job_type: str
    label: str
    description: str = ""
    param_schema: dict[str, dict[str, Any]] = {}
    default_params: dict[str, Any] = {}


class BatchJobTypeListResponse(BaseModel):
    data: list[BatchJobTypeDescriptor]
