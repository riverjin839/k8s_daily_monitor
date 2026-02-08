"""KeycloakChecker: Keycloak readiness & DB connection status."""
from datetime import datetime

import httpx

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult


class KeycloakChecker(BaseChecker):
    """Keycloak: /health/ready 엔드포인트로 인증 서비스 상태 확인."""

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        cfg = self.addon.config or {}
        base_url = cfg.get("url", "http://keycloak.auth.svc:8080").rstrip("/")

        # /health/ready 호출 (Quarkus health check)
        try:
            resp = httpx.get(f"{base_url}/health/ready", timeout=10)
        except httpx.RequestError as e:
            elapsed = self._elapsed_ms(start)
            return CheckResult(
                StatusEnum.critical,
                f"Keycloak unreachable: {str(e)[:100]}",
                elapsed,
                {"url": base_url, "error": str(e)[:200]},
            )

        elapsed = self._elapsed_ms(start)

        # Quarkus health format: {"status": "UP", "checks": [...]}
        checks_info = []
        db_status = "unknown"
        overall_status = "unknown"

        if resp.status_code == 200:
            try:
                data = resp.json()
                overall_status = data.get("status", "UP")
                for chk in data.get("checks", []):
                    chk_name = chk.get("name", "?")
                    chk_status = chk.get("status", "?")
                    checks_info.append({"name": chk_name, "status": chk_status})
                    if "database" in chk_name.lower() or "db" in chk_name.lower():
                        db_status = chk_status
            except Exception:
                overall_status = "UP"
        else:
            overall_status = "DOWN"

        details = {
            "ready": resp.status_code == 200,
            "status_code": resp.status_code,
            "overall_status": overall_status,
            "db_status": db_status,
            "checks": checks_info,
            "url": base_url,
        }

        if resp.status_code == 200 and overall_status == "UP":
            return CheckResult(
                StatusEnum.healthy,
                f"Keycloak ready (DB: {db_status})",
                elapsed,
                details,
            )

        if resp.status_code == 200:
            # some sub-checks failing
            return CheckResult(
                StatusEnum.warning,
                f"Keycloak partially ready (status: {overall_status})",
                elapsed,
                details,
            )

        return CheckResult(
            StatusEnum.critical,
            f"Keycloak not ready (HTTP {resp.status_code})",
            elapsed,
            details,
        )
