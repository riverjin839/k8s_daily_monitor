from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NodeServerSpecBase(BaseModel):
    cluster_id: Optional[UUID] = None
    hostname: str = Field(..., min_length=1, max_length=255)
    node_name: Optional[str] = Field(default=None, max_length=255)
    role: Optional[str] = Field(default=None, max_length=32)
    status: str = Field(default="active", max_length=32)

    internal_ip: Optional[str] = Field(default=None, max_length=64)
    external_ip: Optional[str] = Field(default=None, max_length=64)
    bmc_ip: Optional[str] = Field(default=None, max_length=64)
    bond0_ip: Optional[str] = Field(default=None, max_length=64)
    bond0_mac: Optional[str] = Field(default=None, max_length=40)
    bond0_speed: Optional[str] = Field(default=None, max_length=20)
    bond1_ip: Optional[str] = Field(default=None, max_length=64)
    bond1_mac: Optional[str] = Field(default=None, max_length=40)
    bond1_speed: Optional[str] = Field(default=None, max_length=20)

    vendor: Optional[str] = Field(default=None, max_length=64)
    model: Optional[str] = Field(default=None, max_length=128)
    serial_number: Optional[str] = Field(default=None, max_length=64)
    cpu_model: Optional[str] = Field(default=None, max_length=128)
    cpu_sockets: Optional[int] = Field(default=None, ge=0, le=16)
    cpu_cores: Optional[int] = Field(default=None, ge=0, le=2048)
    cpu_threads: Optional[int] = Field(default=None, ge=0, le=4096)
    memory_gb: Optional[int] = Field(default=None, ge=0, le=65536)
    memory_modules: Optional[str] = Field(default=None, max_length=255)
    disk_total_gb: Optional[int] = Field(default=None, ge=0)
    disk_type: Optional[str] = Field(default=None, max_length=32)
    disk_count: Optional[int] = Field(default=None, ge=0, le=1024)
    raid_config: Optional[str] = Field(default=None, max_length=64)
    gpu_model: Optional[str] = Field(default=None, max_length=128)
    gpu_count: Optional[int] = Field(default=None, ge=0, le=64)

    datacenter: Optional[str] = Field(default=None, max_length=64)
    room: Optional[str] = Field(default=None, max_length=64)
    rack: Optional[str] = Field(default=None, max_length=64)
    rack_unit: Optional[str] = Field(default=None, max_length=16)

    os_image: Optional[str] = Field(default=None, max_length=255)
    kernel_version: Optional[str] = Field(default=None, max_length=128)
    kubelet_version: Optional[str] = Field(default=None, max_length=64)
    container_runtime: Optional[str] = Field(default=None, max_length=64)

    asset_tag: Optional[str] = Field(default=None, max_length=64)
    purchase_date: Optional[date] = None
    warranty_end: Optional[date] = None
    owner: Optional[str] = Field(default=None, max_length=64)

    description: Optional[str] = None


class NodeServerSpecCreate(NodeServerSpecBase):
    pass


class NodeServerSpecUpdate(BaseModel):
    """모든 필드 optional — 부분 업데이트."""
    model_config = ConfigDict(extra="ignore")

    cluster_id: Optional[UUID] = None
    hostname: Optional[str] = None
    node_name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None

    internal_ip: Optional[str] = None
    external_ip: Optional[str] = None
    bmc_ip: Optional[str] = None
    bond0_ip: Optional[str] = None
    bond0_mac: Optional[str] = None
    bond0_speed: Optional[str] = None
    bond1_ip: Optional[str] = None
    bond1_mac: Optional[str] = None
    bond1_speed: Optional[str] = None

    vendor: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    cpu_model: Optional[str] = None
    cpu_sockets: Optional[int] = None
    cpu_cores: Optional[int] = None
    cpu_threads: Optional[int] = None
    memory_gb: Optional[int] = None
    memory_modules: Optional[str] = None
    disk_total_gb: Optional[int] = None
    disk_type: Optional[str] = None
    disk_count: Optional[int] = None
    raid_config: Optional[str] = None
    gpu_model: Optional[str] = None
    gpu_count: Optional[int] = None

    datacenter: Optional[str] = None
    room: Optional[str] = None
    rack: Optional[str] = None
    rack_unit: Optional[str] = None

    os_image: Optional[str] = None
    kernel_version: Optional[str] = None
    kubelet_version: Optional[str] = None
    container_runtime: Optional[str] = None

    asset_tag: Optional[str] = None
    purchase_date: Optional[date] = None
    warranty_end: Optional[date] = None
    owner: Optional[str] = None

    description: Optional[str] = None


class NodeServerSpecOut(NodeServerSpecBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cluster_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class NodeServerSpecList(BaseModel):
    data: list[NodeServerSpecOut]
    total: int


class NodeSpecImportRequest(BaseModel):
    """k8s 클러스터에서 노드 정보를 자동 임포트.

    upsert=True 면 동일 (cluster_id, hostname) 행이 있으면 update,
    아니면 신규 insert. 비어있는 자동수집 필드만 채우고 사용자가 직접 입력한
    필드는 덮어쓰지 않는다.
    """
    upsert: bool = True
    overwrite_user_fields: bool = False  # True 면 vendor/asset_tag 등도 덮어씀


class NodeSpecImportResult(BaseModel):
    inserted: int
    updated: int
    skipped: int
    errors: list[str] = Field(default_factory=list)
    items: list[NodeServerSpecOut]
