import subprocess
import json
from datetime import datetime
from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Cluster, Addon, CheckLog, StatusEnum
from app.config import settings


class HealthChecker:
    def __init__(self, db: Session):
        self.db = db

    def run_check(self, cluster_id: UUID) -> None:
        """클러스터 전체 헬스 체크 실행"""
        cluster = self.db.query(Cluster).filter(Cluster.id == cluster_id).first()
        if not cluster:
            return

        # 클러스터의 모든 애드온 점검
        addons = self.db.query(Addon).filter(Addon.cluster_id == cluster_id).all()

        overall_status = StatusEnum.healthy

        for addon in addons:
            status, message, response_time, details = self._check_addon(cluster, addon)

            # 애드온 상태 업데이트
            addon.status = status
            addon.response_time = response_time
            addon.last_check = datetime.utcnow()
            if details:
                addon.details = details

            # 로그 기록
            log = CheckLog(
                cluster_id=cluster_id,
                addon_id=addon.id,
                status=status,
                message=message,
                raw_output={"response_time": response_time, **(details or {})}
            )
            self.db.add(log)

            # 전체 상태 계산
            if status == StatusEnum.critical:
                overall_status = StatusEnum.critical
            elif status == StatusEnum.warning and overall_status != StatusEnum.critical:
                overall_status = StatusEnum.warning

        # 클러스터 상태 업데이트
        cluster.status = overall_status
        cluster.updated_at = datetime.utcnow()

        # 전체 점검 로그
        cluster_log = CheckLog(
            cluster_id=cluster_id,
            status=overall_status,
            message=f"Cluster check completed - Status: {overall_status.value}",
        )
        self.db.add(cluster_log)

        self.db.commit()

    def _check_addon(self, cluster: Cluster, addon: Addon) -> tuple:
        """개별 애드온 점검 - returns (status, message, response_time, details)"""
        try:
            if addon.type == "etcd-leader":
                return self._check_etcd_leader(cluster, addon)
            elif addon.check_playbook:
                s, m, t = self._run_ansible_check(cluster, addon)
                return s, m, t, None
            else:
                s, m, t = self._run_http_check(cluster, addon)
                return s, m, t, None
        except Exception as e:
            return StatusEnum.critical, f"Check failed: {str(e)}", 0, None

    def _check_etcd_leader(
        self, cluster: Cluster, addon: Addon
    ) -> tuple:
        """etcd 리더 헬스 체크 (Kubernetes API 사용)"""
        from kubernetes import client, config
        from kubernetes.stream import stream as k8s_stream

        try:
            start_time = datetime.utcnow()

            # kubeconfig 로드 (파일 존재 시 사용, 아니면 in-cluster)
            import os
            if cluster.kubeconfig_path and os.path.exists(cluster.kubeconfig_path):
                config.load_kube_config(config_file=cluster.kubeconfig_path)
            else:
                try:
                    config.load_incluster_config()
                except config.ConfigException:
                    # in-cluster도 안되면 기본 kubeconfig 시도
                    config.load_kube_config()

            v1 = client.CoreV1Api()

            # etcd pod 조회
            pods = v1.list_namespaced_pod(
                namespace="kube-system",
                label_selector="component=etcd"
            )

            if not pods.items:
                return (
                    StatusEnum.critical,
                    "No etcd pods found in kube-system",
                    0,
                    {"error": "no_etcd_pods"}
                )

            etcd_pods_info = []
            leader_pod = None

            for pod in pods.items:
                pod_name = pod.metadata.name
                pod_phase = pod.status.phase
                pod_ready = all(
                    cs.ready for cs in (pod.status.container_statuses or [])
                )
                etcd_pods_info.append({
                    "name": pod_name,
                    "phase": pod_phase,
                    "ready": pod_ready,
                })

            # 첫 번째 Running pod에서 etcdctl 실행
            target_pod = None
            for pod in pods.items:
                if pod.status.phase == "Running":
                    target_pod = pod
                    break

            if not target_pod:
                return (
                    StatusEnum.critical,
                    "No running etcd pods found",
                    0,
                    {"pods": etcd_pods_info}
                )

            pod_name = target_pod.metadata.name

            # etcdctl endpoint status 실행
            exec_command = [
                'etcdctl',
                'endpoint', 'status',
                '--cacert=/etc/kubernetes/pki/etcd/ca.crt',
                '--cert=/etc/kubernetes/pki/etcd/server.crt',
                '--key=/etc/kubernetes/pki/etcd/server.key',
                '--write-out=json',
            ]

            try:
                resp = k8s_stream(
                    v1.connect_get_namespaced_pod_exec,
                    pod_name,
                    "kube-system",
                    command=exec_command,
                    container="etcd",
                    stderr=True,
                    stdout=True,
                    stdin=False,
                    tty=False,
                    _preload_content=True,
                )

                end_time = datetime.utcnow()
                response_time = int((end_time - start_time).total_seconds() * 1000)

                # Parse etcdctl JSON output
                etcd_status = json.loads(resp)
                if isinstance(etcd_status, list) and len(etcd_status) > 0:
                    status_entry = etcd_status[0]
                else:
                    status_entry = etcd_status

                header = status_entry.get("Status", status_entry).get("header", {})
                status_data = status_entry.get("Status", status_entry)

                member_id = header.get("member_id", 0)
                leader_id = status_data.get("leader", 0)
                is_leader = (member_id == leader_id) if member_id and leader_id else False
                db_size = status_data.get("dbSize", 0)
                db_size_in_use = status_data.get("dbSizeInUse", 0)
                version = status_data.get("version", "unknown")
                raft_term = status_data.get("raftTerm", 0)
                raft_index = status_data.get("raftIndex", 0)

                details = {
                    "pod_name": pod_name,
                    "is_leader": is_leader,
                    "leader_id": str(leader_id),
                    "member_id": str(member_id),
                    "version": version,
                    "db_size_mb": round(db_size / (1024 * 1024), 2) if db_size else 0,
                    "db_size_in_use_mb": round(db_size_in_use / (1024 * 1024), 2) if db_size_in_use else 0,
                    "raft_term": raft_term,
                    "raft_index": raft_index,
                    "member_count": len(pods.items),
                    "pods": etcd_pods_info,
                }

                # DB 사이즈 경고 (100MB 이상이면 warning)
                if db_size and db_size > 100 * 1024 * 1024:
                    return (
                        StatusEnum.warning,
                        f"etcd leader healthy but DB large ({details['db_size_mb']}MB) - Pod: {pod_name}",
                        response_time,
                        details,
                    )

                leader_label = "Leader" if is_leader else "Follower"
                return (
                    StatusEnum.healthy,
                    f"etcd {leader_label} healthy - v{version}, DB: {details['db_size_mb']}MB, Term: {raft_term}",
                    response_time,
                    details,
                )

            except json.JSONDecodeError:
                # etcdctl 출력이 JSON이 아닌 경우 - 기본 pod 상태만 반환
                end_time = datetime.utcnow()
                response_time = int((end_time - start_time).total_seconds() * 1000)

                details = {
                    "pod_name": pod_name,
                    "member_count": len(pods.items),
                    "pods": etcd_pods_info,
                    "note": "etcdctl output parse failed, using pod status only",
                }

                all_ready = all(p["ready"] for p in etcd_pods_info)
                if all_ready:
                    return (
                        StatusEnum.healthy,
                        f"etcd pod {pod_name} running and ready ({len(pods.items)} members)",
                        response_time,
                        details,
                    )
                else:
                    return (
                        StatusEnum.warning,
                        f"etcd pods partially ready ({len(pods.items)} members)",
                        response_time,
                        details,
                    )

            except Exception as exec_err:
                # exec 실패 시 pod 상태만으로 판단
                end_time = datetime.utcnow()
                response_time = int((end_time - start_time).total_seconds() * 1000)

                details = {
                    "pod_name": pod_name,
                    "member_count": len(pods.items),
                    "pods": etcd_pods_info,
                    "exec_error": str(exec_err)[:200],
                }

                all_running = all(p["phase"] == "Running" for p in etcd_pods_info)
                if all_running:
                    return (
                        StatusEnum.healthy,
                        f"etcd pods running ({len(pods.items)} members) - exec unavailable",
                        response_time,
                        details,
                    )
                else:
                    return (
                        StatusEnum.warning,
                        f"etcd check partial - pods status mixed",
                        response_time,
                        details,
                    )

        except Exception as e:
            return (
                StatusEnum.critical,
                f"etcd leader check failed: {str(e)[:200]}",
                0,
                {"error": str(e)[:500]},
            )

    def _run_ansible_check(
        self, cluster: Cluster, addon: Addon
    ) -> tuple[StatusEnum, str, int]:
        """Ansible playbook으로 점검"""
        playbook_path = f"{settings.ansible_playbook_dir}/{addon.check_playbook}"

        try:
            start_time = datetime.utcnow()

            result = subprocess.run(
                [
                    "ansible-playbook",
                    playbook_path,
                    "-i", f"{settings.ansible_inventory_dir}/clusters.yml",
                    "-e", f"target_cluster={cluster.name}",
                    "-e", f"api_endpoint={cluster.api_endpoint}",
                ],
                capture_output=True,
                text=True,
                timeout=settings.check_timeout_seconds
            )

            end_time = datetime.utcnow()
            response_time = int((end_time - start_time).total_seconds() * 1000)

            if result.returncode == 0:
                return StatusEnum.healthy, f"{addon.name} check passed", response_time
            else:
                return StatusEnum.warning, f"{addon.name} check failed: {result.stderr[:200]}", response_time

        except subprocess.TimeoutExpired:
            return StatusEnum.critical, f"{addon.name} check timed out", settings.check_timeout_seconds * 1000
        except Exception as e:
            return StatusEnum.critical, f"{addon.name} check error: {str(e)}", 0

    def _run_http_check(
        self, cluster: Cluster, addon: Addon
    ) -> tuple[StatusEnum, str, int]:
        """HTTP 헬스체크"""
        import httpx

        # 애드온별 엔드포인트 매핑
        endpoint_map = {
            "API Server": "/healthz",
            "etcd": "/health",
            "Metrics Server": "/metrics",
        }

        endpoint = endpoint_map.get(addon.name, "/healthz")
        url = f"{cluster.api_endpoint}{endpoint}"

        try:
            start_time = datetime.utcnow()

            with httpx.Client(verify=False, timeout=10.0) as client:
                response = client.get(url)

            end_time = datetime.utcnow()
            response_time = int((end_time - start_time).total_seconds() * 1000)

            if response.status_code == 200:
                if response_time > 3000:  # 3초 이상이면 warning
                    return StatusEnum.warning, f"{addon.name} slow response ({response_time}ms)", response_time
                return StatusEnum.healthy, f"{addon.name} healthy ({response_time}ms)", response_time
            else:
                return StatusEnum.warning, f"{addon.name} returned {response.status_code}", response_time

        except httpx.TimeoutException:
            return StatusEnum.critical, f"{addon.name} connection timeout", 10000
        except Exception as e:
            return StatusEnum.critical, f"{addon.name} connection failed: {str(e)}", 0
