"""JenkinsChecker: Jenkins mode, quietingDown, executor count check."""
from datetime import datetime

import httpx

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult


class JenkinsChecker(BaseChecker):
    """Jenkins: system mode, quieting-down 상태, executor 수 확인."""

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        cfg = self.addon.config or {}
        base_url = cfg.get("url", "http://jenkins.devops.svc:8080").rstrip("/")
        username = cfg.get("username")
        api_token = cfg.get("api_token")

        headers: dict[str, str] = {}
        auth = None
        if username and api_token:
            auth = (username, api_token)

        try:
            resp = httpx.get(
                f"{base_url}/api/json",
                auth=auth,
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
        except httpx.RequestError as e:
            elapsed = self._elapsed_ms(start)
            return CheckResult(
                StatusEnum.critical,
                f"Jenkins unreachable: {str(e)[:100]}",
                elapsed,
                {"url": base_url, "error": str(e)[:200]},
            )
        except httpx.HTTPStatusError as e:
            elapsed = self._elapsed_ms(start)
            return CheckResult(
                StatusEnum.critical,
                f"Jenkins returned {e.response.status_code}",
                elapsed,
                {"url": base_url, "status_code": e.response.status_code},
            )

        elapsed = self._elapsed_ms(start)
        data = resp.json()

        mode = data.get("mode", "UNKNOWN")  # NORMAL or SHUTDOWN
        quieting_down = data.get("quietingDown", False)
        num_executors = data.get("numExecutors", 0)
        node_desc = data.get("nodeDescription", "")

        # queue info
        queue_items = 0
        if "overallLoad" in data:
            pass  # not always available
        # try to get queue length from separate endpoint
        try:
            q_resp = httpx.get(f"{base_url}/queue/api/json", auth=auth, timeout=5)
            if q_resp.status_code == 200:
                queue_items = len(q_resp.json().get("items", []))
        except Exception:
            pass

        details = {
            "mode": mode,
            "quieting_down": quieting_down,
            "num_executors": num_executors,
            "queue_items": queue_items,
            "node_description": node_desc,
            "url": base_url,
        }

        if mode == "NORMAL" and not quieting_down:
            status = StatusEnum.healthy
            msg = f"Jenkins Normal - Executors: {num_executors}, Queue: {queue_items}"
            if queue_items > 20:
                status = StatusEnum.warning
                msg = f"Jenkins queue backed up ({queue_items} items)"
        elif quieting_down:
            status = StatusEnum.warning
            msg = "Jenkins quieting down (preparing shutdown)"
        else:
            status = StatusEnum.critical
            msg = f"Jenkins mode: {mode}"

        return CheckResult(status, msg, elapsed, details)
