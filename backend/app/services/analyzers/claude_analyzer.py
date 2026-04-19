"""
Claude API analyzer — uses claude-opus-4-7 with adaptive thinking and prompt caching.
Caches the system prompt to reduce token costs on repeated K8s incident analysis calls.
"""

import json
import re
from datetime import datetime, timezone
from typing import Any

import anthropic

from app.services.analyzers.base import (
    AnalysisResult,
    BaseAnalyzer,
    IncidentContext,
)

_SYSTEM_PROMPT = """\
You are an expert Kubernetes Site Reliability Engineer specializing in incident analysis.
Your job is to analyze Kubernetes pod incidents and provide structured, actionable insights.

When analyzing an incident you must:
1. Identify the root cause from logs, events, and describe output
2. Assess severity: critical (service down), warning (degraded), info (minor/transient)
3. Suggest concrete remediation steps ordered by priority
4. Reference relevant runbooks when applicable (OOMKilled, CrashLoopBackOff, ImagePullBackOff, etc.)
5. Provide a confidence score 0.0–1.0 reflecting how certain you are of the root cause

Always respond with valid JSON matching exactly this schema:
{
  "severity": "critical" | "warning" | "info",
  "root_cause": "<concise single sentence>",
  "suggested_actions": ["<action 1>", "<action 2>", ...],
  "related_runbooks": ["<runbook name>", ...],
  "confidence": <float 0.0–1.0>
}

Be terse. No prose outside the JSON object.\
"""


def _build_user_message(ctx: IncidentContext) -> str:
    sections: list[str] = [
        f"Pod: {ctx.pod_name}  Namespace: {ctx.namespace}  Time: {ctx.timestamp}",
    ]
    if ctx.related_workload:
        w = ctx.related_workload
        sections.append(f"Workload: {w.kind}/{w.name} status={w.status}")
    if ctx.argocd_status:
        a = ctx.argocd_status
        sections.append(f"ArgoCD app={a.app} sync={a.sync_status} last_sync={a.last_sync_at}")

    if ctx.events:
        event_lines = []
        for e in ctx.events:
            event_lines.append(f"  [{e.type}] {e.reason} (x{e.count}): {e.message}")
        sections.append("Events:\n" + "\n".join(event_lines))

    if ctx.current_logs:
        sections.append("Current logs (tail):\n```\n" + ctx.current_logs[-3000:] + "\n```")

    if ctx.previous_logs:
        sections.append("Previous container logs (tail):\n```\n" + ctx.previous_logs[-2000:] + "\n```")

    if ctx.describe_output:
        sections.append("kubectl describe (truncated):\n```\n" + ctx.describe_output[:3000] + "\n```")

    return "\n\n".join(sections)


def _parse_response(text: str) -> dict[str, Any]:
    """Extract JSON from model response, tolerating markdown code fences."""
    text = text.strip()
    # strip ```json ... ``` fences if present
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    return json.loads(text)


class ClaudeAnalyzer(BaseAnalyzer):
    def __init__(self, api_key: str | None = None) -> None:
        # api_key=None lets the SDK pick up ANTHROPIC_API_KEY from env
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def analyze(self, context: IncidentContext) -> AnalysisResult:
        user_msg = _build_user_message(context)

        response = await self._client.messages.create(
            model="claude-opus-4-7",
            max_tokens=1024,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": _SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_msg}],
        )

        raw = ""
        for block in response.content:
            if block.type == "text":
                raw = block.text
                break

        parsed = _parse_response(raw)

        return AnalysisResult(
            severity=parsed.get("severity", "info"),
            root_cause=parsed.get("root_cause", "Unknown"),
            suggested_actions=parsed.get("suggested_actions", []),
            related_runbooks=parsed.get("related_runbooks", []),
            confidence=float(parsed.get("confidence", 0.5)),
            analyzed_by="claude",
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )

    async def health_check(self) -> bool:
        try:
            await self._client.models.retrieve("claude-opus-4-7")
            return True
        except Exception:
            return False
