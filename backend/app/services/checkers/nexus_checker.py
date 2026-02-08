"""NexusChecker: Sonatype Nexus Repository writable status check."""
from datetime import datetime

import httpx

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult


class NexusChecker(BaseChecker):
    """Nexus Repository: writable 상태 및 전체 헬스 체크."""

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        cfg = self.addon.config or {}
        base_url = cfg.get("url", "http://nexus.devops.svc:8081").rstrip("/")

        # 1) writable check
        writable = False
        writable_status_code = 0
        try:
            resp = httpx.get(f"{base_url}/service/rest/v1/status/writable", timeout=10)
            writable_status_code = resp.status_code
            writable = resp.status_code == 200
        except httpx.RequestError:
            pass

        # 2) overall status (fallback & extra info)
        system_status = "unknown"
        system_code = 0
        try:
            resp2 = httpx.get(f"{base_url}/service/rest/v1/status", timeout=10)
            system_code = resp2.status_code
            system_status = "available" if resp2.status_code == 200 else "unavailable"
        except httpx.RequestError:
            system_status = "unreachable"

        elapsed = self._elapsed_ms(start)

        details = {
            "writable": writable,
            "writable_status_code": writable_status_code,
            "system_status": system_status,
            "system_status_code": system_code,
            "url": base_url,
        }

        if writable:
            return CheckResult(
                StatusEnum.healthy,
                f"Nexus writable & available ({elapsed}ms)",
                elapsed,
                details,
            )

        if system_status == "available":
            return CheckResult(
                StatusEnum.warning,
                "Nexus available but Read-Only (disk full?)",
                elapsed,
                details,
            )

        return CheckResult(
            StatusEnum.critical,
            f"Nexus unreachable or down (system: {system_status})",
            elapsed,
            details,
        )
