"""
API Server Checker - Kubernetes API 서버 헬스 체크
"""
import time
import httpx

from app.checkers.base import BaseChecker, CheckResult, CheckStatus, ClusterConfig


class APIServerChecker(BaseChecker):
    """
    Kubernetes API Server 헬스 체크

    체크 항목:
    - /healthz - 전체 헬스
    - /livez - Liveness
    - /readyz - Readiness
    """

    name = "api-server"
    description = "Kubernetes API Server"
    category = "core"
    icon = "🔌"

    # 체크할 엔드포인트 목록
    health_endpoints = ["/healthz", "/livez", "/readyz"]

    async def check(self, config: ClusterConfig) -> CheckResult:
        """API 서버 헬스 체크 수행"""
        details = {}
        overall_status = CheckStatus.healthy
        total_response_time = 0

        async with httpx.AsyncClient(
            verify=False,
            timeout=self.timeout_seconds
        ) as client:
            for endpoint in self.health_endpoints:
                url = f"{config.api_endpoint}{endpoint}"

                start = time.time()
                try:
                    response = await client.get(url)
                    response_time = int((time.time() - start) * 1000)
                    total_response_time += response_time

                    endpoint_status = CheckStatus.healthy
                    if response.status_code != 200:
                        endpoint_status = CheckStatus.critical
                        overall_status = CheckStatus.critical
                    elif response_time > self.warning_threshold_ms:
                        endpoint_status = CheckStatus.warning
                        if overall_status == CheckStatus.healthy:
                            overall_status = CheckStatus.warning

                    details[endpoint] = {
                        "status": endpoint_status.value,
                        "status_code": response.status_code,
                        "response_time_ms": response_time,
                        "body": response.text[:200] if response.text else None
                    }

                except httpx.TimeoutException:
                    details[endpoint] = {
                        "status": CheckStatus.critical.value,
                        "error": "Timeout"
                    }
                    overall_status = CheckStatus.critical

                except Exception as e:
                    details[endpoint] = {
                        "status": CheckStatus.critical.value,
                        "error": str(e)
                    }
                    overall_status = CheckStatus.critical

        # 평균 응답 시간
        avg_response_time = total_response_time // len(self.health_endpoints) if details else None

        # 메시지 생성
        if overall_status == CheckStatus.healthy:
            message = "API Server is healthy"
        elif overall_status == CheckStatus.warning:
            message = "API Server is slow (response > 3s)"
        else:
            failed = [ep for ep, d in details.items() if d.get("status") == "critical"]
            message = f"API Server unhealthy: {', '.join(failed)}"

        return CheckResult(
            status=overall_status,
            message=message,
            response_time_ms=avg_response_time,
            details=details
        )
