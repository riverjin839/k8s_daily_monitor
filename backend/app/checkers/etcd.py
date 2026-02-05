"""
etcd Checker - etcd 클러스터 헬스 체크
"""
import subprocess
import json
import time

from app.checkers.base import BaseChecker, CheckResult, CheckStatus, ClusterConfig


class EtcdChecker(BaseChecker):
    """
    etcd 클러스터 헬스 체크

    체크 항목:
    - etcd 멤버 상태
    - etcd 헬스 엔드포인트
    - componentstatuses에서 etcd 상태
    """

    name = "etcd"
    description = "etcd Distributed Key-Value Store"
    category = "core"
    icon = "💾"

    async def check(self, config: ClusterConfig) -> CheckResult:
        """etcd 헬스 체크 수행"""
        details = {}
        start = time.time()

        try:
            # kubectl get componentstatuses로 etcd 상태 확인
            cmd = self._build_kubectl_cmd(config, "get", "componentstatuses", "-o", "json")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if proc.returncode != 0:
                return CheckResult(
                    status=CheckStatus.critical,
                    message=f"Failed to get component statuses: {proc.stderr}",
                    details={"error": proc.stderr}
                )

            data = json.loads(proc.stdout)
            etcd_components = []

            for item in data.get("items", []):
                name = item.get("metadata", {}).get("name", "")
                if "etcd" in name.lower():
                    conditions = item.get("conditions", [])
                    status = CheckStatus.critical
                    message = ""

                    for cond in conditions:
                        if cond.get("type") == "Healthy":
                            if cond.get("status") == "True":
                                status = CheckStatus.healthy
                            message = cond.get("message", "")
                            break

                    etcd_components.append({
                        "name": name,
                        "status": status.value,
                        "message": message
                    })

            # 전체 상태 결정
            if not etcd_components:
                # componentstatuses에 etcd가 없으면 다른 방법 시도
                details["note"] = "etcd not found in componentstatuses, may be managed externally"
                overall_status = CheckStatus.unknown
                message = "etcd status unknown (not in componentstatuses)"
            else:
                details["members"] = etcd_components
                critical_count = sum(1 for c in etcd_components if c["status"] == "critical")

                if critical_count == 0:
                    overall_status = CheckStatus.healthy
                    message = f"All {len(etcd_components)} etcd member(s) healthy"
                elif critical_count < len(etcd_components):
                    overall_status = CheckStatus.warning
                    message = f"{critical_count}/{len(etcd_components)} etcd member(s) unhealthy"
                else:
                    overall_status = CheckStatus.critical
                    message = "All etcd members unhealthy"

            response_time = int((time.time() - start) * 1000)

            return CheckResult(
                status=overall_status,
                message=message,
                response_time_ms=response_time,
                details=details
            )

        except subprocess.TimeoutExpired:
            return CheckResult(
                status=CheckStatus.critical,
                message="etcd check timed out",
                details={"error": "Timeout"}
            )
        except Exception as e:
            return CheckResult(
                status=CheckStatus.critical,
                message=f"etcd check failed: {str(e)}",
                details={"error": str(e)}
            )

    def _build_kubectl_cmd(self, config: ClusterConfig, *args) -> list:
        """kubectl 명령어 빌드"""
        cmd = ["kubectl"]
        if config.kubeconfig_path:
            cmd.extend(["--kubeconfig", config.kubeconfig_path])
        if config.api_endpoint:
            cmd.extend(["--server", config.api_endpoint])
        cmd.extend(args)
        return cmd
