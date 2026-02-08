"""NodeChecker: 1 API call → 메모리 연산으로 200노드+ 최적화."""
from datetime import datetime

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult


class NodeChecker(BaseChecker):
    """
    list_node() 딱 1회 호출 후 메모리에서 집계.
    - Ready / NotReady 카운트
    - DiskPressure, MemoryPressure, PIDPressure 이슈 노드 필터링
    """

    # 감시할 condition 타입
    PRESSURE_CONDITIONS = {"DiskPressure", "MemoryPressure", "PIDPressure"}

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        v1 = self._get_k8s_client()

        # ── 단 1회 API 호출 ────────────────────────────────
        nodes = v1.list_node()
        elapsed = self._elapsed_ms(start)

        total = len(nodes.items)
        ready_count = 0
        not_ready_nodes: list[str] = []
        issues: list[dict] = []

        for node in nodes.items:
            name = node.metadata.name
            conditions = {c.type: c for c in (node.status.conditions or [])}

            # Ready 상태 판별
            ready_cond = conditions.get("Ready")
            if ready_cond and ready_cond.status == "True":
                ready_count += 1
            else:
                not_ready_nodes.append(name)

            # Pressure 조건 체크
            for cond_type in self.PRESSURE_CONDITIONS:
                cond = conditions.get(cond_type)
                if cond and cond.status == "True":
                    issues.append({"node": name, "reason": cond_type})

        # ── 상태 판정 ──────────────────────────────────────
        details = {
            "total": total,
            "ready": ready_count,
            "not_ready": not_ready_nodes[:20],  # 최대 20개만
            "issues": issues[:50],  # 최대 50개만
        }

        if ready_count == 0 and total > 0:
            return CheckResult(
                status=StatusEnum.critical,
                message=f"All {total} nodes NotReady",
                response_time=elapsed,
                details=details,
            )

        if not_ready_nodes or issues:
            return CheckResult(
                status=StatusEnum.warning,
                message=f"Nodes {ready_count}/{total} Ready, {len(issues)} pressure issues",
                response_time=elapsed,
                details=details,
            )

        return CheckResult(
            status=StatusEnum.healthy,
            message=f"All {total} nodes Ready",
            response_time=elapsed,
            details=details,
        )
