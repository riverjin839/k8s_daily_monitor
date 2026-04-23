from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


DataType = Literal["text", "number", "date", "checkbox", "select"]


class ClusterCustomFieldBase(BaseModel):
    key: str = Field(..., min_length=1, max_length=64, pattern=r"^[A-Za-z][A-Za-z0-9_]*$",
                     description="snake_case / camelCase 식별자 (JSON 키로 사용)")
    label: str = Field(..., min_length=1, max_length=128)
    data_type: DataType = "text"
    options: Optional[list[str]] = None   # data_type=select 일 때만 의미 있음
    description: Optional[str] = None
    sort_order: int = Field(default=0, ge=0, le=10000)
    width: Optional[int] = Field(default=None, ge=40, le=800)


class ClusterCustomFieldCreate(ClusterCustomFieldBase):
    pass


class ClusterCustomFieldUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    label: Optional[str] = None
    data_type: Optional[DataType] = None
    options: Optional[list[str]] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    width: Optional[int] = None


class ClusterCustomFieldOut(ClusterCustomFieldBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: datetime
    updated_at: datetime


class ClusterCustomFieldList(BaseModel):
    data: list[ClusterCustomFieldOut]


class ClusterCustomValuesUpdate(BaseModel):
    """특정 클러스터의 custom_values 부분 업데이트.
    전달된 키들만 교체 (나머지 기존 값 보존). null 로 보내면 해당 키 삭제.
    """
    values: dict[str, Any]
