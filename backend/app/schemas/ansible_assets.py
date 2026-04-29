"""Pydantic schemas — Ansible Playbook 파일 / Inventory (DB 관리형)."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Playbook File (공용) ───────────────────────────────────────────────

class AnsiblePlaybookFileBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    content: str = Field(..., min_length=1)
    tags: Optional[str] = Field(default=None, max_length=255)


class AnsiblePlaybookFileCreate(AnsiblePlaybookFileBase):
    pass


class AnsiblePlaybookFileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    content: Optional[str] = None
    tags: Optional[str] = Field(default=None, max_length=255)


class AnsiblePlaybookFileResponse(AnsiblePlaybookFileBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Inventory (per cluster, multiple) ──────────────────────────────────

class AnsibleInventoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    content: str = Field(..., min_length=1)
    is_default: bool = False


class AnsibleInventoryCreate(AnsibleInventoryBase):
    cluster_id: UUID


class AnsibleInventoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = Field(default=None, max_length=500)
    content: Optional[str] = None
    is_default: Optional[bool] = None


class AnsibleInventoryResponse(AnsibleInventoryBase):
    id: UUID
    cluster_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
