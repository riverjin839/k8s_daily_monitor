"""ControlPlaneChecker: API Server latency + scheduler/controller-manager pod 상태."""
from datetime import datetime

import httpx

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult

# kube-system 에서 라벨로 조회할 컴포넌트
_COMPONENTS = [
    {"label": "component=kube-scheduler", "name": "Scheduler"},
    {"label": "component=kube-controller-manager", "name": "Controller Manager"},
]


class ControlPlaneChecker(BaseChecker):
    """
    1) API Server /livez 엔드포인트 latency 체크
    2) kube-scheduler, kube-controller-manager pod 상태 (라벨 셀렉터, 1 call each)
    """

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        components: list[dict] = []

        # ── 1. API Server /livez ───────────────────────────
        api_status, api_latency = self._check_api_server()
        components.append({
            "name": "API Server",
            "status": api_status.value,
            "latency_ms": api_latency,
        })

        # ── 2. Core components (pod label selector) ────────
        v1 = self._get_k8s_client()
        for comp in _COMPONENTS:
            pods = v1.list_namespaced_pod(
                namespace="kube-system",
                label_selector=comp["label"],
            )
            total = len(pods.items)
            running_ready = 0
            for pod in pods.items:
                if pod.status.phase == "Running" and all(
                    cs.ready for cs in (pod.status.container_statuses or [])
                ):
                    running_ready += 1

            if total == 0:
                comp_status = StatusEnum.critical
            elif running_ready < total:
                comp_status = StatusEnum.warning
            else:
                comp_status = StatusEnum.healthy

            components.append({
                "name": comp["name"],
                "status": comp_status.value,
                "ready": running_ready,
                "total": total,
            })

        elapsed = self._elapsed_ms(start)

        # ── 종합 판정 ─────────────────────────────────────
        statuses = [c["status"] for c in components]
        if "critical" in statuses:
            overall = StatusEnum.critical
        elif "warning" in statuses:
            overall = StatusEnum.warning
        else:
            overall = StatusEnum.healthy

        healthy_count = sum(1 for s in statuses if s == "healthy")
        details = {
            "components": components,
            "api_latency_ms": api_latency,
        }

        return CheckResult(
            status=overall,
            message=f"Control Plane {healthy_count}/{len(components)} healthy, API {api_latency}ms",
            response_time=elapsed,
            details=details,
        )

    def _check_api_server(self) -> tuple[StatusEnum, int]:
        """API Server /livez 엔드포인트 latency 체크."""
        url = f"{self.cluster.api_endpoint}/livez"
        try:
            t0 = datetime.utcnow()
            with httpx.Client(verify=False, timeout=10.0) as client:
                resp = client.get(url)
            latency = self._elapsed_ms(t0)

            if resp.status_code == 200:
                if latency > 3000:
                    return StatusEnum.warning, latency
                return StatusEnum.healthy, latency
            return StatusEnum.warning, latency
        except httpx.TimeoutException:
            return StatusEnum.critical, 10000
        except Exception:
            return StatusEnum.critical, 0
