"""
OpenClaw router — webhook receiver and status/history endpoints.

POST /openclaw/webhook   ← OpenClaw agent sends alerts here
GET  /openclaw/status    ← integration health check
GET  /openclaw/alerts    ← recent alert history
"""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.openclaw_alert_service import openclaw_alert_service

router = APIRouter(prefix="/openclaw", tags=["openclaw"])


# ── Schemas ──────────────────────────────────────────────────────────

class AlertWebhookRequest(BaseModel):
    severity: str = Field(default="warning", description="critical | warning | info")
    pod_name: str = Field(..., min_length=1, description="Affected pod name")
    namespace: str = Field(default="default", description="K8s namespace")
    reason: str = Field(default="", description="K8s event reason")
    message: str = Field(default="", description="Human-readable alert message")
    timestamp: Optional[str] = Field(default=None, description="ISO 8601 timestamp")


class AlertWebhookResponse(BaseModel):
    status: str = Field(..., description="dispatched | no_channel")
    channels: list[str] = Field(default_factory=list, description="Channels that received the alert")
    ai_enriched: bool = Field(default=False, description="Whether AI suggestion was added")


class OpenClawStatusResponse(BaseModel):
    enabled: bool
    channels: dict
    recent_alert_count: int


class AlertRecord(BaseModel):
    severity: str
    pod_name: str
    namespace: str
    reason: str
    message: str
    ai_suggestion: str = ""
    timestamp: str
    dispatched: dict


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/webhook", response_model=AlertWebhookResponse)
async def receive_alert(body: AlertWebhookRequest):
    """
    Webhook endpoint for OpenClaw agent.
    Receives K8s error alerts and dispatches to Telegram/Slack.
    """
    result = await openclaw_alert_service.process_alert(body.model_dump())
    return AlertWebhookResponse(**result)


@router.get("/status", response_model=OpenClawStatusResponse)
async def openclaw_status():
    """Check OpenClaw integration status and configured channels."""
    return OpenClawStatusResponse(**openclaw_alert_service.get_status())


@router.get("/alerts", response_model=list[AlertRecord])
async def recent_alerts(limit: int = 20):
    """Retrieve recent alerts processed through OpenClaw."""
    data = openclaw_alert_service.get_recent_alerts(limit=limit)
    return [AlertRecord(**a) for a in data]
