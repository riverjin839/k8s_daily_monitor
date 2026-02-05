"""
System Pods Checker - kube-system 네임스페이스 파드 체크
"""
import subprocess
import json
import time

from app.checkers.base import BaseChecker, CheckResult, CheckStatus, ClusterConfig


class SystemPodsChecker(BaseChecker):
    """
    kube-system 네임스페이스 파드 상태 체크

    체크 항목:
    - 파드 Running 상태
    - 재시작 횟수 (10회 이상 warning)
    - 중요 파드 확인 (coredns, kube-proxy 등)
    """

    name = "system-pods"
    description = "Kubernetes System Pods (kube-system)"
    category = "core"
    icon = "📦"

    # 재시작 경고 임계값
    restart_warning_threshold = 10

    # 중요 파드 패턴
    critical_pods = ["coredns", "kube-proxy", "kube-apiserver", "kube-scheduler", "kube-controller"]

    async def check(self, config: ClusterConfig) -> CheckResult:
        """시스템 파드 상태 체크 수행"""
        start = time.time()

        try:
            cmd = self._build_kubectl_cmd(
                config, "get", "pods", "-n", "kube-system", "-o", "json"
            )
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if proc.returncode != 0:
                return CheckResult(
                    status=CheckStatus.critical,
                    message=f"Failed to get pods: {proc.stderr}",
                    details={"error": proc.stderr}
                )

            data = json.loads(proc.stdout)
            pods = data.get("items", [])

            pod_details = []
            running_count = 0
            not_running_count = 0
            high_restart_pods = []

            for pod in pods:
                name = pod.get("metadata", {}).get("name", "unknown")
                phase = pod.get("status", {}).get("phase", "Unknown")

                # 재시작 횟수 계산
                restart_count = 0
                container_statuses = pod.get("status", {}).get("containerStatuses", [])
                for cs in container_statuses:
                    restart_count += cs.get("restartCount", 0)

                if phase == "Running":
                    running_count += 1
                else:
                    not_running_count += 1

                if restart_count >= self.restart_warning_threshold:
                    high_restart_pods.append({"name": name, "restarts": restart_count})

                pod_details.append({
                    "name": name,
                    "status": phase,
                    "restarts": restart_count
                })

            # 중요 파드 확인
            missing_critical = []
            for critical in self.critical_pods:
                found = any(critical in p["name"] for p in pod_details if p["status"] == "Running")
                if not found:
                    # 해당 파드가 아예 없는지 확인
                    exists = any(critical in p["name"] for p in pod_details)
                    if exists:
                        missing_critical.append(critical)

            # 전체 상태 결정
            total_pods = len(pod_details)

            if not_running_count > 0 or missing_critical:
                if not_running_count > total_pods // 2:
                    overall_status = CheckStatus.critical
                else:
                    overall_status = CheckStatus.warning
            elif high_restart_pods:
                overall_status = CheckStatus.warning
            else:
                overall_status = CheckStatus.healthy

            # 메시지 생성
            messages = []
            messages.append(f"{running_count}/{total_pods} pods running")

            if not_running_count > 0:
                messages.append(f"{not_running_count} not running")
            if high_restart_pods:
                messages.append(f"{len(high_restart_pods)} with high restarts")
            if missing_critical:
                messages.append(f"missing: {', '.join(missing_critical)}")

            response_time = int((time.time() - start) * 1000)

            return CheckResult(
                status=overall_status,
                message="; ".join(messages),
                response_time_ms=response_time,
                details={
                    "total_pods": total_pods,
                    "running": running_count,
                    "not_running": not_running_count,
                    "high_restart_pods": high_restart_pods,
                    "pods": pod_details[:50]  # 처음 50개만
                }
            )

        except subprocess.TimeoutExpired:
            return CheckResult(
                status=CheckStatus.critical,
                message="System pods check timed out",
                details={"error": "Timeout"}
            )
        except Exception as e:
            return CheckResult(
                status=CheckStatus.critical,
                message=f"System pods check failed: {str(e)}",
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
