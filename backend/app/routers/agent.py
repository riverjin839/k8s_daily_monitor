"""
AI Agent router — POST /agent/chat and GET /agent/health.

All endpoints are fail-safe: if Ollama is down the frontend receives
a structured response (never a 500) so the main dashboard keeps working.
"""

from pydantic import BaseModel, Field
from typing import Optional

from fastapi import APIRouter

from app.services.agent_service import agent_service

router = APIRouter(prefix="/agent", tags=["agent"])


# ── Request / Response schemas ────────────────────────────────────────

class AgentChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="User question")
    context: Optional[dict] = Field(default=None, description="Optional K8s context (cluster_name, pod_logs, …)")


class AgentChatResponse(BaseModel):
    status: str = Field(..., description="'ok' when LLM responded, 'offline' otherwise")
    answer: str = Field(..., description="LLM answer or fallback message")
    model: str = Field(default="", description="Model name (empty when offline)")


class AgentHealthResponse(BaseModel):
    status: str = Field(..., description="'online' or 'offline'")
    detail: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────

@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(body: AgentChatRequest):
    """
    Send a question to the AI Agent.

    Returns HTTP 200 in all cases:
    - ``status: "ok"``      → LLM answered successfully
    - ``status: "offline"`` → Ollama unreachable; ``answer`` contains a friendly message
    """
    result = await agent_service.ask_agent(query=body.query, context=body.context)
    return AgentChatResponse(**result)


@router.get("/health", response_model=AgentHealthResponse)
async def agent_health():
    """Quick Ollama availability probe (does NOT load a model)."""
    result = await agent_service.health_check()
    return AgentHealthResponse(**result)
