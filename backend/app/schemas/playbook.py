from datetime import datetime
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, Field, model_validator


class PlaybookBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    # 신규: DB 에 저장된 Playbook 파일 / Inventory 참조 (선호)
    playbook_file_id: Optional[UUID] = None
    inventory_id: Optional[UUID] = None
    # 구: 호스트 경로 직접 지정 (호환을 위해 유지). 둘 중 하나는 채워져야 한다.
    playbook_path: Optional[str] = Field(default=None, max_length=500)
    inventory_path: Optional[str] = None
    extra_vars: Optional[dict[str, Any]] = None
    tags: Optional[str] = None


class PlaybookCreate(PlaybookBase):
    cluster_id: UUID

    @model_validator(mode="after")
    def _require_source(self) -> "PlaybookCreate":
        if not self.playbook_file_id and not (self.playbook_path and self.playbook_path.strip()):
            raise ValueError("playbook_file_id 또는 playbook_path 중 하나는 필수입니다")
        return self


class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    playbook_file_id: Optional[UUID] = None
    inventory_id: Optional[UUID] = None
    playbook_path: Optional[str] = None
    inventory_path: Optional[str] = None
    extra_vars: Optional[dict[str, Any]] = None
    tags: Optional[str] = None
    show_on_dashboard: Optional[bool] = None


class PlaybookResponse(PlaybookBase):
    id: UUID
    cluster_id: UUID
    status: str = "unknown"
    show_on_dashboard: bool = False
    last_run_at: Optional[datetime] = None
    last_result: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    # 표시 편의 — joined 된 파일/인벤토리 이름
    playbook_file_name: Optional[str] = None
    inventory_name: Optional[str] = None

    class Config:
        from_attributes = True


class PlaybookListResponse(BaseModel):
    data: list[PlaybookResponse]


class PlaybookRunResponse(BaseModel):
    id: UUID
    status: str
    message: str
    stats: Optional[dict[str, Any]] = None
    duration_ms: int = 0
