"""
Incident analysis router — POST /analyze/incident

Accepts a pod incident context and returns an LLM-generated (or rule-based) analysis.
Backend is selected at runtime via the ANALYZER_BACKEND environment variable.
"""

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.analyzers import (
    AnalysisResult,
    ArgocdStatus,
    IncidentContext,
    KubeEvent,
    RelatedWorkload,
    get_analyzer,
)

router = APIRouter(prefix="/analyze", tags=["analyze"])


# ── Request schemas ───────────────────────────────────────────────────

class KubeEventSchema(BaseModel):
    reason: str
    message: str
    count: int = 1
    first_time: str = ""
    last_time: str = ""
    type: str = "Normal"


class RelatedWorkloadSchema(BaseModel):
    kind: str
    name: str
    status: str


class ArgocdStatusSchema(BaseModel):
    app: str
    sync_status: str
    last_sync_at: str


class IncidentContextSchema(BaseModel):
    pod_name: str = Field(..., min_length=1)
    namespace: str = Field(..., min_length=1)
    timestamp: str
    events: list[KubeEventSchema] = []
    current_logs: str = ""
    describe_output: str = ""
    previous_logs: Optional[str] = None
    related_workload: Optional[RelatedWorkloadSchema] = None
    argocd_status: Optional[ArgocdStatusSchema] = None


# ── Response schemas ──────────────────────────────────────────────────

class AnalysisResultSchema(BaseModel):
    severity: Literal["critical", "warning", "info"]
    root_cause: str
    suggested_actions: list[str]
    related_runbooks: list[str] = []
    confidence: float
    analyzed_by: Literal["claude", "local_llm", "rule_based"]
    analyzed_at: str


class AnalyzeResponse(BaseModel):
    status: Literal["ok", "error"]
    result: Optional[AnalysisResultSchema] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    backend: str
    available: bool


# ── Endpoints ─────────────────────────────────────────────────────────

@router.post("/incident", response_model=AnalyzeResponse)
async def analyze_incident(body: IncidentContextSchema):
    """Analyze a Kubernetes pod incident and return structured insights."""
    analyzer = get_analyzer()

    ctx = IncidentContext(
        pod_name=body.pod_name,
        namespace=body.namespace,
        timestamp=body.timestamp,
        events=[
            KubeEvent(
                reason=e.reason,
                message=e.message,
                count=e.count,
                first_time=e.first_time,
                last_time=e.last_time,
                type=e.type,
            )
            for e in body.events
        ],
        current_logs=body.current_logs,
        describe_output=body.describe_output,
        previous_logs=body.previous_logs,
        related_workload=(
            RelatedWorkload(
                kind=body.related_workload.kind,
                name=body.related_workload.name,
                status=body.related_workload.status,
            )
            if body.related_workload
            else None
        ),
        argocd_status=(
            ArgocdStatus(
                app=body.argocd_status.app,
                sync_status=body.argocd_status.sync_status,
                last_sync_at=body.argocd_status.last_sync_at,
            )
            if body.argocd_status
            else None
        ),
    )

    try:
        result: AnalysisResult = await analyzer.analyze(ctx)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Analyzer error: {exc}") from exc

    return AnalyzeResponse(
        status="ok",
        result=AnalysisResultSchema(
            severity=result.severity,
            root_cause=result.root_cause,
            suggested_actions=result.suggested_actions,
            related_runbooks=result.related_runbooks,
            confidence=result.confidence,
            analyzed_by=result.analyzed_by,
            analyzed_at=result.analyzed_at,
        ),
    )


@router.get("/health", response_model=HealthResponse)
async def analyzer_health():
    """Check whether the configured analyzer backend is reachable."""
    import os
    backend = os.getenv("ANALYZER_BACKEND", "rule_based")
    analyzer = get_analyzer()
    available = await analyzer.health_check()
    return HealthResponse(backend=backend, available=available)
