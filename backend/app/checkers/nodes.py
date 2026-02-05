"""
Nodes Checker - Kubernetes 노드 상태 체크
"""
import subprocess
import json
import time

from app.checkers.base import BaseChecker, CheckResult, CheckStatus, ClusterConfig


class NodesChecker(BaseChecker):
    """
    Kubernetes 노드 상태 체크

    체크 항목:
    - 노드 Ready 상태
    - 노드 리소스 (CPU, Memory, Pods)
    - 노드 조건 (DiskPressure, MemoryPressure 등)
    """

    name = "nodes"
    description = "Kubernetes Cluster Nodes"
    category = "core"
    icon = "🖥️"

    async def check(self, config: ClusterConfig) -> CheckResult:
        """노드 상태 체크 수행"""
        start = time.time()

        try:
            cmd = self._build_kubectl_cmd(config, "get", "nodes", "-o", "json")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if proc.returncode != 0:
                return CheckResult(
                    status=CheckStatus.critical,
                    message=f"Failed to get nodes: {proc.stderr}",
                    details={"error": proc.stderr}
                )

            data = json.loads(proc.stdout)
            nodes = data.get("items", [])

            total_nodes = len(nodes)
            ready_nodes = 0
            node_details = []

            for node in nodes:
                name = node.get("metadata", {}).get("name", "unknown")
                conditions = node.get("status", {}).get("conditions", [])
                capacity = node.get("status", {}).get("capacity", {})
                allocatable = node.get("status", {}).get("allocatable", {})

                # Ready 상태 확인
                node_status = "NotReady"
                node_issues = []

                for cond in conditions:
                    cond_type = cond.get("type")
                    cond_status = cond.get("status")

                    if cond_type == "Ready":
                        node_status = "Ready" if cond_status == "True" else "NotReady"
                        if cond_status == "True":
                            ready_nodes += 1
                    elif cond_type in ["DiskPressure", "MemoryPressure", "PIDPressure"] and cond_status == "True":
                        node_issues.append(cond_type)

                node_details.append({
                    "name": name,
                    "status": node_status,
                    "issues": node_issues,
                    "capacity": {
                        "cpu": capacity.get("cpu", "N/A"),
                        "memory": capacity.get("memory", "N/A"),
                        "pods": capacity.get("pods", "N/A"),
                    },
                    "allocatable": {
                        "cpu": allocatable.get("cpu", "N/A"),
                        "memory": allocatable.get("memory", "N/A"),
                        "pods": allocatable.get("pods", "N/A"),
                    }
                })

            # 전체 상태 결정
            if total_nodes == 0:
                overall_status = CheckStatus.critical
                message = "No nodes found in cluster"
            elif ready_nodes == 0:
                overall_status = CheckStatus.critical
                message = "All nodes are NotReady"
            elif ready_nodes < total_nodes:
                overall_status = CheckStatus.warning
                message = f"{ready_nodes}/{total_nodes} nodes Ready"
            else:
                overall_status = CheckStatus.healthy
                message = f"All {total_nodes} nodes Ready"

            # 이슈 있는 노드 확인
            nodes_with_issues = [n for n in node_details if n.get("issues")]
            if nodes_with_issues and overall_status == CheckStatus.healthy:
                overall_status = CheckStatus.warning
                message += f" ({len(nodes_with_issues)} with pressure issues)"

            response_time = int((time.time() - start) * 1000)

            return CheckResult(
                status=overall_status,
                message=message,
                response_time_ms=response_time,
                details={
                    "total_nodes": total_nodes,
                    "ready_nodes": ready_nodes,
                    "nodes": node_details
                }
            )

        except subprocess.TimeoutExpired:
            return CheckResult(
                status=CheckStatus.critical,
                message="Nodes check timed out",
                details={"error": "Timeout"}
            )
        except Exception as e:
            return CheckResult(
                status=CheckStatus.critical,
                message=f"Nodes check failed: {str(e)}",
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
