from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class NodeSummary(BaseModel):
    name: str
    internal_ip: Optional[str] = None
    external_ip: Optional[str] = None
    roles: list[str] = []
    ready: bool = True
    os: Optional[str] = None
    kubelet_version: Optional[str] = None


class NodeListResponse(BaseModel):
    cluster_id: UUID
    cluster_name: str
    nodes: list[NodeSummary]


class SSHTargetIn(BaseModel):
    host: str = Field(..., description="IP 또는 FQDN")
    # 아래 인증 정보는 target 별로 override 가능. 빈 값이면 요청 루트의 기본값을 사용.
    username: Optional[str] = None
    port: Optional[int] = None


class BulkExecRequest(BaseModel):
    cluster_id: Optional[UUID] = None  # 참조용 (선택)

    action: Literal["ssh", "scp"] = "ssh"
    targets: list[SSHTargetIn] = Field(..., min_length=1, max_length=200)

    # SSH / SCP 공용 인증
    username: str = Field(default="root", min_length=1, max_length=64)
    port: int = Field(default=22, ge=1, le=65535)
    password: Optional[str] = None
    private_key: Optional[str] = None

    # ssh
    command: Optional[str] = None

    # scp
    scp_content: Optional[str] = None     # 업로드할 파일 내용
    scp_remote_path: Optional[str] = None

    mode: Literal["sequential", "parallel"] = "parallel"
    parallelism: int = Field(default=10, ge=1, le=50)
    connect_timeout: int = Field(default=8, ge=1, le=60)
    exec_timeout: int = Field(default=60, ge=1, le=600)


class BulkExecResultItem(BaseModel):
    host: str
    status: Literal["ok", "error", "timeout", "auth_error", "connect_error"]
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    error: Optional[str] = None


class BulkExecResponse(BaseModel):
    action: Literal["ssh", "scp"]
    mode: Literal["sequential", "parallel"]
    total: int
    ok_count: int
    error_count: int
    total_duration_ms: int
    results: list[BulkExecResultItem]
