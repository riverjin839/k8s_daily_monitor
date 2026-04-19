"""
Rule-based analyzer — fast, dependency-free, always available.
Pattern-matches against common Kubernetes failure signatures.
"""

import re
from datetime import datetime, timezone

from app.services.analyzers.base import (
    AnalysisResult,
    BaseAnalyzer,
    IncidentContext,
)


_RULES: list[tuple[str, str, str, list[str], list[str], float]] = [
    # (regex pattern, severity, root_cause, actions, runbooks, confidence)
    (
        r"OOMKilled|OutOfMemory|out of memory|Cannot allocate memory",
        "critical",
        "Container killed due to Out Of Memory (OOM)",
        [
            "Increase container memory limit in Pod spec",
            "Review application for memory leaks (heap dumps, profiling)",
            "Check if requests/limits are set appropriately",
        ],
        ["OOMKilled"],
        0.9,
    ),
    (
        r"CrashLoopBackOff",
        "critical",
        "Container is crash-looping; check previous container logs for the root error",
        [
            "Run: kubectl logs <pod> --previous to inspect the crash",
            "Check application startup logic and required dependencies",
            "Verify environment variables and secrets are correctly mounted",
        ],
        ["CrashLoopBackOff"],
        0.85,
    ),
    (
        r"ImagePullBackOff|ErrImagePull|image pull failed|not found",
        "critical",
        "Kubernetes cannot pull the container image",
        [
            "Verify the image name and tag are correct",
            "Check imagePullSecret is configured for private registries",
            "Confirm the image exists in the registry",
        ],
        ["ImagePullBackOff"],
        0.9,
    ),
    (
        r"Liveness probe failed|Readiness probe failed|probe failure",
        "warning",
        "Health probe is failing; pod may be unready or stuck",
        [
            "Check probe endpoint (/health, /ready) is reachable inside the container",
            "Increase initialDelaySeconds if the app is slow to start",
            "Review application logs for startup errors",
        ],
        ["ProbeFailure"],
        0.8,
    ),
    (
        r"Insufficient cpu|Insufficient memory|Unschedulable|No nodes available",
        "warning",
        "Pod cannot be scheduled due to insufficient cluster resources",
        [
            "Check node capacity: kubectl describe nodes",
            "Lower resource requests or add more nodes",
            "Review pending pods: kubectl get pods --field-selector=status.phase=Pending",
        ],
        ["ResourcePressure"],
        0.85,
    ),
    (
        r"connection refused|connection timed out|dial tcp.*:i?o timeout",
        "warning",
        "Network connectivity failure — pod cannot reach a dependency",
        [
            "Verify the target Service/Endpoint exists: kubectl get endpoints",
            "Check NetworkPolicy rules that may be blocking traffic",
            "Test DNS resolution from inside the pod",
        ],
        ["NetworkConnectivity"],
        0.75,
    ),
    (
        r"failed to mount|MountVolume|unable to mount|volume.*not found",
        "critical",
        "Volume mount failure — PVC or ConfigMap/Secret may be missing",
        [
            "Check PVC status: kubectl get pvc -n <namespace>",
            "Verify ConfigMap/Secret referenced in the pod spec exists",
            "Review StorageClass and provisioner logs",
        ],
        ["VolumeMountFailure"],
        0.85,
    ),
    (
        r"Back-off restarting|back-off pulling",
        "warning",
        "Kubernetes is backing off restarts or image pulls",
        [
            "Wait for back-off to clear, then inspect logs",
            "Address underlying crash or image pull issue first",
        ],
        ["BackOff"],
        0.7,
    ),
]


def _combined_text(ctx: IncidentContext) -> str:
    parts = [ctx.current_logs or "", ctx.describe_output or ""]
    parts += [f"{e.reason} {e.message}" for e in ctx.events]
    if ctx.previous_logs:
        parts.append(ctx.previous_logs)
    return " ".join(parts)


class RuleBasedAnalyzer(BaseAnalyzer):
    async def analyze(self, context: IncidentContext) -> AnalysisResult:
        text = _combined_text(context)

        for pattern, severity, root_cause, actions, runbooks, confidence in _RULES:
            if re.search(pattern, text, re.IGNORECASE):
                return AnalysisResult(
                    severity=severity,
                    root_cause=root_cause,
                    suggested_actions=actions,
                    related_runbooks=runbooks,
                    confidence=confidence,
                    analyzed_by="rule_based",
                    analyzed_at=datetime.now(timezone.utc).isoformat(),
                )

        # No pattern matched
        return AnalysisResult(
            severity="info",
            root_cause="No known failure pattern detected; manual review required",
            suggested_actions=[
                "Review full pod logs: kubectl logs <pod> -n <namespace>",
                "Inspect recent events: kubectl get events -n <namespace> --sort-by='.lastTimestamp'",
            ],
            related_runbooks=[],
            confidence=0.2,
            analyzed_by="rule_based",
            analyzed_at=datetime.now(timezone.utc).isoformat(),
        )

    async def health_check(self) -> bool:
        return True
