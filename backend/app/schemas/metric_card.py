from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class MetricCardBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    icon: str = "📊"
    promql: str = Field(..., min_length=1)
    unit: str = ""
    display_type: str = "value"
    category: str = "general"
    thresholds: Optional[str] = None
    grafana_panel_url: Optional[str] = None
    sort_order: int = 0
    enabled: bool = True


class MetricCardCreate(MetricCardBase):
    pass


class MetricCardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    promql: Optional[str] = None
    unit: Optional[str] = None
    display_type: Optional[str] = None
    category: Optional[str] = None
    thresholds: Optional[str] = None
    grafana_panel_url: Optional[str] = None
    sort_order: Optional[int] = None
    enabled: Optional[bool] = None


class MetricCardResponse(MetricCardBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MetricCardListResponse(BaseModel):
    data: list[MetricCardResponse]


class MetricQueryResult(BaseModel):
    """Result of executing a PromQL query."""
    card_id: UUID
    status: str = "ok"  # ok | error | offline
    value: Optional[float] = None
    labels: Optional[dict] = None
    # For 'list' display_type: multiple results
    results: Optional[list[dict]] = None
    error: Optional[str] = None
