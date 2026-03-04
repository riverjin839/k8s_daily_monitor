from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional
from enum import Enum


class StatusEnum(str, Enum):
    healthy = "healthy"
    warning = "warning"
    critical = "critical"


class ClusterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    api_endpoint: str = Field(..., min_length=1, max_length=255)
    kubeconfig_path: Optional[str] = None
    # 클러스터 관리 메타데이터 (optional)
    region: Optional[str] = None
    operation_level: Optional[str] = None
    max_pod: Optional[int] = None
    cilium_config: Optional[str] = None
    cidr: Optional[str] = None
    description: Optional[str] = None
    node_count: Optional[int] = None
    hostname: Optional[str] = None


class ClusterCreate(ClusterBase):
    # kubeconfig YAML 원문 (직접 입력 / 파일 업로드 시 사용, DB에 저장하지 않음)
    kubeconfig_content: Optional[str] = None


class ClusterUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    api_endpoint: Optional[str] = Field(None, min_length=1, max_length=255)
    kubeconfig_path: Optional[str] = None
    status: Optional[StatusEnum] = None
    region: Optional[str] = None
    operation_level: Optional[str] = None
    max_pod: Optional[int] = None
    cilium_config: Optional[str] = None
    cidr: Optional[str] = None
    description: Optional[str] = None
    node_count: Optional[int] = None
    hostname: Optional[str] = None


class ClusterResponse(ClusterBase):
    id: UUID
    status: StatusEnum
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ClusterListResponse(BaseModel):
    data: list[ClusterResponse]
