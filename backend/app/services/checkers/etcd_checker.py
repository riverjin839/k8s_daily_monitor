"""EtcdChecker: etcd leader 헬스 체크 (기존 로직을 BaseChecker로 이전)."""
import json
from datetime import datetime

from kubernetes.stream import stream as k8s_stream

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult


class EtcdChecker(BaseChecker):
    """etcd leader election & health status via etcdctl exec."""

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        v1 = self._get_k8s_client()

        # ── etcd pod 조회 ──────────────────────────────────
        pods = v1.list_namespaced_pod(
            namespace="kube-system",
            label_selector="component=etcd",
        )
        if not pods.items:
            return CheckResult(
                status=StatusEnum.critical,
                message="No etcd pods found in kube-system",
                details={"error": "no_etcd_pods"},
            )

        pods_info = [
            {
                "name": p.metadata.name,
                "phase": p.status.phase,
                "ready": all(cs.ready for cs in (p.status.container_statuses or [])),
            }
            for p in pods.items
        ]

        # 첫 Running pod 선택
        target = next((p for p in pods.items if p.status.phase == "Running"), None)
        if not target:
            return CheckResult(
                status=StatusEnum.critical,
                message="No running etcd pods found",
                details={"pods": pods_info},
            )

        pod_name = target.metadata.name

        # ── etcdctl exec ───────────────────────────────────
        try:
            resp = k8s_stream(
                v1.connect_get_namespaced_pod_exec,
                pod_name,
                "kube-system",
                command=[
                    "etcdctl", "endpoint", "status",
                    "--cacert=/etc/kubernetes/pki/etcd/ca.crt",
                    "--cert=/etc/kubernetes/pki/etcd/server.crt",
                    "--key=/etc/kubernetes/pki/etcd/server.key",
                    "--write-out=json",
                ],
                container="etcd",
                stderr=True, stdout=True, stdin=False, tty=False,
                _preload_content=True,
            )
            elapsed = self._elapsed_ms(start)
            return self._parse_etcdctl(resp, pod_name, pods_info, elapsed)

        except json.JSONDecodeError:
            elapsed = self._elapsed_ms(start)
            all_ready = all(p["ready"] for p in pods_info)
            return CheckResult(
                status=StatusEnum.healthy if all_ready else StatusEnum.warning,
                message=f"etcd pod {pod_name} {'ready' if all_ready else 'partially ready'} ({len(pods_info)} members)",
                response_time=elapsed,
                details={"pod_name": pod_name, "member_count": len(pods_info), "pods": pods_info},
            )

        except Exception as exec_err:
            elapsed = self._elapsed_ms(start)
            all_running = all(p["phase"] == "Running" for p in pods_info)
            return CheckResult(
                status=StatusEnum.healthy if all_running else StatusEnum.warning,
                message=f"etcd pods {'running' if all_running else 'mixed'} ({len(pods_info)} members) - exec unavailable",
                response_time=elapsed,
                details={"pod_name": pod_name, "member_count": len(pods_info), "exec_error": str(exec_err)[:200]},
            )

    def _parse_etcdctl(self, resp: str, pod_name: str, pods_info: list, elapsed: int) -> CheckResult:
        data = json.loads(resp)
        entry = data[0] if isinstance(data, list) and data else data

        status_data = entry.get("Status", entry)
        header = status_data.get("header", {})

        member_id = header.get("member_id", 0)
        leader_id = status_data.get("leader", 0)
        is_leader = (member_id == leader_id) if member_id and leader_id else False
        db_size = status_data.get("dbSize", 0)
        version = status_data.get("version", "unknown")
        raft_term = status_data.get("raftTerm", 0)

        details = {
            "pod_name": pod_name,
            "is_leader": is_leader,
            "leader_id": str(leader_id),
            "member_id": str(member_id),
            "version": version,
            "db_size_mb": round(db_size / (1024 * 1024), 2) if db_size else 0,
            "db_size_in_use_mb": round(status_data.get("dbSizeInUse", 0) / (1024 * 1024), 2),
            "raft_term": raft_term,
            "raft_index": status_data.get("raftIndex", 0),
            "member_count": len(pods_info),
            "pods": pods_info,
        }

        if db_size and db_size > 100 * 1024 * 1024:
            return CheckResult(StatusEnum.warning, f"etcd DB large ({details['db_size_mb']}MB)", elapsed, details)

        label = "Leader" if is_leader else "Follower"
        return CheckResult(
            StatusEnum.healthy,
            f"etcd {label} healthy - v{version}, DB: {details['db_size_mb']}MB, Term: {raft_term}",
            elapsed,
            details,
        )
