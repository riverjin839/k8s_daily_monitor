"""
Local LLM analyzer — delegates to the existing Ollama endpoint.
Reuses the same prompt structure as the Claude analyzer.
"""

import json
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings
from app.services.analyzers.base import (
    AnalysisResult,
    BaseAnalyzer,
    IncidentContext,
)

_SYSTEM = (
    "You are a Kubernetes SRE. Analyze incidents and respond ONLY with a JSON object "
    "containing: severity (critical|warning|info), root_cause (string), "
    "suggested_actions (array of strings), related_runbooks (array of strings), "
    "confidence (float 0-1)."
)


def _build_prompt(ctx: IncidentContext) -> str:
    parts = [f"Pod: {ctx.pod_name}  Namespace: {ctx.namespace}"]
    if ctx.events:
        parts.append("Events: " + "; ".join(f"{e.reason}: {e.message}" for e in ctx.events[:5]))
    if ctx.current_logs:
        parts.append("Logs:\n" + ctx.current_logs[-2000:])
    if ctx.describe_output:
        parts.append("Describe:\n" + ctx.describe_output[:2000])
    return "\n\n".join(parts)


def _parse(text: str) -> dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    # find first { ... }
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        text = m.group(0)
    return json.loads(text)


class LocalLLMAnalyzer(BaseAnalyzer):
    def __init__(self) -> None:
        self._base_url = str(settings.ollama_url).rstrip("/")
        self._model = settings.ollama_model
        self._timeout = getattr(settings, "ollama_timeout", 120)

    async def analyze(self, context: IncidentContext) -> AnalysisResult:
        prompt = _build_prompt(context)
        payload = {
            "model": self._model,
            "system": _SYSTEM,
            "prompt": prompt,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(f"{self._base_url}/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()

        raw = data.get("response", "")
        try:
            parsed = _parse(raw)
        except Exception:
            return AnalysisResult(
                severity="info",
                root_cause="Local LLM returned unparseable response",
                suggested_actions=["Review pod logs manually"],
                confidence=0.1,
                analyzed_by="local_llm",
                analyzed_at=datetime.now(timezone.utc).isoformat(),
            )

        return AnalysisResult(
            severity=parsed.get("severity", "info"),
            root_cause=parsed.get("root_cause", "Unknown"),
            suggested_actions=parsed.get("suggested_actions", []),
            related_runbooks=parsed.get("related_runbooks", []),
            confidence=float(parsed.get("confidence", 0.4)),
            analyzed_by="local_llm",
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self._base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False
