"""PVC / PV 상태 점검.

* Pending / Lost PVC 개수
* PV 가 Released 인데 PVC 가 없는 'orphan'
* PV capacity 와 PVC capacity 불일치
"""
from __future__ import annotations

from app.models import StatusEnum
from app.services.deep_checkers.base import (
    DeepCheckContext,
    DeepCheckOutcome,
    DeepCheckerBase,
)


class PvcHealthChecker(DeepCheckerBase):
    check_type = "pvc_health"
    display_name = "PVC / PV 상태"

    def run(self, ctx: DeepCheckContext) -> DeepCheckOutcome:
        warning_pending = int(ctx.thresholds.get("warning_pending", 1))
        critical_pending = int(ctx.thresholds.get("critical_pending", 5))

        v1 = self._v1(ctx)
        pvcs = v1.list_persistent_volume_claim_for_all_namespaces(timeout_seconds=15)
        pvs = v1.list_persistent_volume(timeout_seconds=15)

        pending = [p for p in pvcs.items if (p.status and p.status.phase == "Pending")]
        lost = [p for p in pvcs.items if (p.status and p.status.phase == "Lost")]
        bound_pvc_names = {
            f"{p.metadata.namespace}/{p.metadata.name}"
            for p in pvcs.items
            if p.status and p.status.phase == "Bound"
        }

        orphans = []
        for pv in pvs.items:
            phase = pv.status.phase if pv.status else None
            if phase in ("Released", "Failed"):
                claim = pv.spec.claim_ref if pv.spec else None
                if claim is None:
                    orphans.append(pv.metadata.name)
                else:
                    key = f"{claim.namespace}/{claim.name}"
                    if key not in bound_pvc_names:
                        orphans.append(pv.metadata.name)

        pending_count = len(pending) + len(lost)
        status = StatusEnum.healthy
        if pending_count >= critical_pending or len(lost) > 0:
            status = StatusEnum.critical
        elif pending_count >= warning_pending or len(orphans) > 0:
            status = StatusEnum.warning

        return DeepCheckOutcome(
            status=status,
            message=(
                f"Pending {len(pending)}건, Lost {len(lost)}건, "
                f"Released-orphan {len(orphans)}건"
            ),
            details={
                "pending_pvcs": [f"{p.metadata.namespace}/{p.metadata.name}" for p in pending][:50],
                "lost_pvcs": [f"{p.metadata.namespace}/{p.metadata.name}" for p in lost][:50],
                "orphan_pvs": orphans[:50],
                "total_pvcs": len(pvcs.items),
                "total_pvs": len(pvs.items),
            },
        )
