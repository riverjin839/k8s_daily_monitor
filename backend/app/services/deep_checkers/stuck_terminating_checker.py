"""Terminating 상태로 임계 시간 이상 머무는 pod 검출."""
from __future__ import annotations

from datetime import datetime, timezone

from app.models import StatusEnum
from app.services.deep_checkers.base import (
    DeepCheckContext,
    DeepCheckOutcome,
    DeepCheckerBase,
)


class StuckTerminatingChecker(DeepCheckerBase):
    check_type = "stuck_terminating"
    display_name = "Stuck Terminating Pods"

    def run(self, ctx: DeepCheckContext) -> DeepCheckOutcome:
        warning_minutes = int(ctx.thresholds.get("warning_minutes", 5))
        critical_minutes = int(ctx.thresholds.get("critical_minutes", 30))

        v1 = self._v1(ctx)
        pods = v1.list_pod_for_all_namespaces(timeout_seconds=20)
        now = datetime.now(timezone.utc)

        stuck: list[dict[str, object]] = []
        for p in pods.items:
            meta = p.metadata
            if meta is None or meta.deletion_timestamp is None:
                continue
            delta = (now - meta.deletion_timestamp).total_seconds() / 60.0
            stuck.append({
                "namespace": meta.namespace,
                "pod": meta.name,
                "minutes_terminating": round(delta, 1),
                "phase": p.status.phase if p.status else None,
            })

        max_minutes = max((s["minutes_terminating"] for s in stuck), default=0)  # type: ignore[type-var]

        status = StatusEnum.healthy
        if any(float(s["minutes_terminating"]) >= critical_minutes for s in stuck):  # type: ignore[arg-type]
            status = StatusEnum.critical
        elif any(float(s["minutes_terminating"]) >= warning_minutes for s in stuck):  # type: ignore[arg-type]
            status = StatusEnum.warning

        return DeepCheckOutcome(
            status=status,
            message=(
                f"Terminating {len(stuck)}건, 최장 {max_minutes}분"
                if stuck else "Stuck terminating 없음"
            ),
            details={
                "warning_minutes": warning_minutes,
                "critical_minutes": critical_minutes,
                "stuck_pods": sorted(
                    stuck, key=lambda s: float(s["minutes_terminating"]), reverse=True  # type: ignore[arg-type]
                )[:50],
            },
        )
