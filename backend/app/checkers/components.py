"""
Components Checker - Kubernetes 컨트롤 플레인 컴포넌트 체크
"""
import subprocess
import json
import time

from app.checkers.base import BaseChecker, CheckResult, CheckStatus, ClusterConfig


class ComponentsChecker(BaseChecker):
    """
    Kubernetes 컨트롤 플레인 컴포넌트 체크

    체크 항목:
    - kube-scheduler
    - kube-controller-manager
    - (etcd는 별도 checker에서 처리)
    """

    name = "components"
    description = "Kubernetes Control Plane Components"
    category = "core"
    icon = "🎛️"

    async def check(self, config: ClusterConfig) -> CheckResult:
        """컴포넌트 상태 체크 수행"""
        start = time.time()

        try:
            cmd = self._build_kubectl_cmd(config, "get", "componentstatuses", "-o", "json")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if proc.returncode != 0:
                return CheckResult(
                    status=CheckStatus.critical,
                    message=f"Failed to get component statuses: {proc.stderr}",
                    details={"error": proc.stderr}
                )

            data = json.loads(proc.stdout)
            components = {}

            for item in data.get("items", []):
                name = item.get("metadata", {}).get("name", "unknown")
                conditions = item.get("conditions", [])

                comp_status = CheckStatus.critical
                message = ""

                for cond in conditions:
                    if cond.get("type") == "Healthy":
                        if cond.get("status") == "True":
                            comp_status = CheckStatus.healthy
                        message = cond.get("message", "")
                        break

                components[name] = {
                    "status": comp_status.value,
                    "message": message
                }

            # 전체 상태 결정
            if not components:
                return CheckResult(
                    status=CheckStatus.unknown,
                    message="No components found",
                    details={"note": "componentstatuses may be deprecated in newer K8s versions"}
                )

            critical_count = sum(1 for c in components.values() if c["status"] == "critical")
            total_count = len(components)

            if critical_count == 0:
                overall_status = CheckStatus.healthy
                message = f"All {total_count} components healthy"
            elif critical_count < total_count:
                overall_status = CheckStatus.warning
                unhealthy = [n for n, c in components.items() if c["status"] == "critical"]
                message = f"Unhealthy components: {', '.join(unhealthy)}"
            else:
                overall_status = CheckStatus.critical
                message = "All components unhealthy"

            response_time = int((time.time() - start) * 1000)

            return CheckResult(
                status=overall_status,
                message=message,
                response_time_ms=response_time,
                details={"components": components}
            )

        except subprocess.TimeoutExpired:
            return CheckResult(
                status=CheckStatus.critical,
                message="Components check timed out",
                details={"error": "Timeout"}
            )
        except Exception as e:
            return CheckResult(
                status=CheckStatus.critical,
                message=f"Components check failed: {str(e)}",
                details={"error": str(e)}
            )

    def _build_kubectl_cmd(self, config: ClusterConfig, *args) -> list:
        cmd = ["kubectl"]
        if config.kubeconfig_path:
            cmd.extend(["--kubeconfig", config.kubeconfig_path])
        if config.api_endpoint:
            cmd.extend(["--server", config.api_endpoint])
        cmd.extend(args)
        return cmd
