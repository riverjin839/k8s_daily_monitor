"""
일일 K8s 클러스터 헬스 체크 서비스
- API 서버 상태 체크
- 컴포넌트 상태 체크 (etcd, scheduler, controller-manager)
- 노드 상태 체크
- 시스템 파드 상태 체크
"""
import subprocess
import json
import time
from datetime import datetime
from typing import Optional
import httpx
from sqlalchemy.orm import Session

from app.models import Cluster, DailyCheckLog, CheckScheduleType, StatusEnum
from app.config import settings


class DailyChecker:
    def __init__(self, db: Session):
        self.db = db
        self.timeout = settings.check_timeout_seconds

    async def run_daily_check(
        self,
        cluster_id: str,
        schedule_type: CheckScheduleType = CheckScheduleType.manual
    ) -> DailyCheckLog:
        """일일 체크 실행"""
        start_time = time.time()

        cluster = self.db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            raise ValueError(f"Cluster not found: {cluster_id}")

        # 각 체크 수행
        api_result = await self._check_api_server(cluster)
        components_result = await self._check_components(cluster)
        nodes_result = await self._check_nodes(cluster)
        pods_result = await self._check_system_pods(cluster)

        # 전체 상태 결정
        overall_status = self._determine_overall_status(
            api_result, components_result, nodes_result
        )

        # 에러/경고 수집
        errors, warnings = self._collect_messages(
            api_result, components_result, nodes_result, pods_result
        )

        # 체크 로그 생성
        check_log = DailyCheckLog(
            cluster_id=cluster.id,
            schedule_type=schedule_type,
            check_date=datetime.utcnow(),
            overall_status=overall_status,
            # API 서버
            api_server_status=api_result.get("status", StatusEnum.critical),
            api_server_response_time_ms=api_result.get("response_time_ms"),
            api_server_details=api_result.get("details"),
            # 컴포넌트
            components_status=components_result,
            # 노드
            nodes_status=nodes_result.get("nodes"),
            total_nodes=nodes_result.get("total", 0),
            ready_nodes=nodes_result.get("ready", 0),
            # 시스템 파드
            system_pods_status=pods_result,
            # 에러/경고
            error_messages=errors if errors else None,
            warning_messages=warnings if warnings else None,
            # 메타
            check_duration_seconds=int(time.time() - start_time),
        )

        self.db.add(check_log)

        # 클러스터 상태 업데이트
        cluster.status = overall_status
        cluster.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(check_log)

        return check_log

    async def _check_api_server(self, cluster: Cluster) -> dict:
        """API 서버 헬스 체크"""
        result = {
            "status": StatusEnum.critical,
            "response_time_ms": None,
            "details": {}
        }

        endpoints = ["/healthz", "/livez", "/readyz"]

        try:
            async with httpx.AsyncClient(verify=False, timeout=self.timeout) as client:
                for endpoint in endpoints:
                    url = f"{cluster.api_endpoint}{endpoint}"
                    start = time.time()
                    try:
                        response = await client.get(url)
                        response_time = int((time.time() - start) * 1000)

                        result["details"][endpoint] = {
                            "status_code": response.status_code,
                            "response_time_ms": response_time,
                            "body": response.text[:500] if response.text else None
                        }

                        if endpoint == "/healthz":
                            result["response_time_ms"] = response_time

                    except Exception as e:
                        result["details"][endpoint] = {
                            "error": str(e)
                        }

            # 상태 결정
            healthz = result["details"].get("/healthz", {})
            if healthz.get("status_code") == 200:
                if result["response_time_ms"] and result["response_time_ms"] < 3000:
                    result["status"] = StatusEnum.healthy
                else:
                    result["status"] = StatusEnum.warning
            else:
                result["status"] = StatusEnum.critical

        except Exception as e:
            result["details"]["error"] = str(e)

        return result

    async def _check_components(self, cluster: Cluster) -> dict:
        """컴포넌트 상태 체크 (kubectl 사용)"""
        components = {}

        try:
            # kubectl get componentstatuses -o json
            cmd = self._build_kubectl_cmd(cluster, "get", "componentstatuses", "-o", "json")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if proc.returncode == 0:
                data = json.loads(proc.stdout)
                for item in data.get("items", []):
                    name = item.get("metadata", {}).get("name", "unknown")
                    conditions = item.get("conditions", [])

                    status = StatusEnum.critical
                    message = ""

                    for cond in conditions:
                        if cond.get("type") == "Healthy":
                            if cond.get("status") == "True":
                                status = StatusEnum.healthy
                            message = cond.get("message", "")
                            break

                    components[name] = {
                        "status": status.value,
                        "message": message
                    }
            else:
                components["error"] = proc.stderr

        except subprocess.TimeoutExpired:
            components["error"] = "Command timeout"
        except Exception as e:
            components["error"] = str(e)

        return components

    async def _check_nodes(self, cluster: Cluster) -> dict:
        """노드 상태 체크"""
        result = {"nodes": [], "total": 0, "ready": 0}

        try:
            cmd = self._build_kubectl_cmd(cluster, "get", "nodes", "-o", "json")
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if proc.returncode == 0:
                data = json.loads(proc.stdout)
                nodes = data.get("items", [])
                result["total"] = len(nodes)

                for node in nodes:
                    name = node.get("metadata", {}).get("name", "unknown")
                    conditions = node.get("status", {}).get("conditions", [])
                    capacity = node.get("status", {}).get("capacity", {})

                    node_status = "NotReady"
                    for cond in conditions:
                        if cond.get("type") == "Ready":
                            node_status = "Ready" if cond.get("status") == "True" else "NotReady"
                            break

                    if node_status == "Ready":
                        result["ready"] += 1

                    result["nodes"].append({
                        "name": name,
                        "status": node_status,
                        "cpu": capacity.get("cpu", "N/A"),
                        "memory": capacity.get("memory", "N/A"),
                        "pods": capacity.get("pods", "N/A"),
                    })

        except Exception as e:
            result["error"] = str(e)

        return result

    async def _check_system_pods(self, cluster: Cluster) -> list:
        """kube-system 파드 상태 체크"""
        pods = []

        try:
            cmd = self._build_kubectl_cmd(
                cluster, "get", "pods", "-n", "kube-system", "-o", "json"
            )
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if proc.returncode == 0:
                data = json.loads(proc.stdout)
                for item in data.get("items", []):
                    name = item.get("metadata", {}).get("name", "unknown")
                    phase = item.get("status", {}).get("phase", "Unknown")
                    restart_count = 0

                    container_statuses = item.get("status", {}).get("containerStatuses", [])
                    for cs in container_statuses:
                        restart_count += cs.get("restartCount", 0)

                    pods.append({
                        "name": name,
                        "namespace": "kube-system",
                        "status": phase,
                        "restarts": restart_count,
                    })

        except Exception as e:
            pods.append({"error": str(e)})

        return pods

    def _build_kubectl_cmd(self, cluster: Cluster, *args) -> list:
        """kubectl 명령어 빌드"""
        cmd = ["kubectl"]

        if cluster.kubeconfig_path:
            cmd.extend(["--kubeconfig", cluster.kubeconfig_path])

        if cluster.api_endpoint:
            cmd.extend(["--server", cluster.api_endpoint])

        cmd.extend(args)
        return cmd

    def _determine_overall_status(
        self, api_result: dict, components: dict, nodes: dict
    ) -> StatusEnum:
        """전체 상태 결정"""
        # API 서버가 critical이면 전체 critical
        if api_result.get("status") == StatusEnum.critical:
            return StatusEnum.critical

        # 컴포넌트 중 critical이 있으면 전체 critical
        for comp_name, comp_data in components.items():
            if comp_name == "error":
                continue
            if comp_data.get("status") == "critical":
                return StatusEnum.critical

        # 노드가 하나도 Ready가 아니면 critical
        if nodes.get("total", 0) > 0 and nodes.get("ready", 0) == 0:
            return StatusEnum.critical

        # 일부 노드가 NotReady면 warning
        if nodes.get("ready", 0) < nodes.get("total", 0):
            return StatusEnum.warning

        # API 서버가 warning이면 전체 warning
        if api_result.get("status") == StatusEnum.warning:
            return StatusEnum.warning

        return StatusEnum.healthy

    def _collect_messages(
        self, api_result: dict, components: dict, nodes: dict, pods: list
    ) -> tuple:
        """에러/경고 메시지 수집"""
        errors = []
        warnings = []

        # API 서버 에러
        if api_result.get("status") == StatusEnum.critical:
            errors.append(f"API Server: {api_result.get('details', {}).get('error', 'Unhealthy')}")

        # 컴포넌트 에러
        for name, data in components.items():
            if name == "error":
                errors.append(f"Components check failed: {data}")
            elif data.get("status") == "critical":
                errors.append(f"Component {name}: {data.get('message', 'Unhealthy')}")

        # 노드 에러
        not_ready = nodes.get("total", 0) - nodes.get("ready", 0)
        if not_ready > 0:
            warnings.append(f"{not_ready} node(s) not ready")

        # 파드 에러 (재시작 많은 파드)
        for pod in pods:
            if pod.get("restarts", 0) > 10:
                warnings.append(f"Pod {pod.get('name')} has {pod.get('restarts')} restarts")

        return errors, warnings
