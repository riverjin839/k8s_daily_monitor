"""SystemPodChecker: DaemonSet / Deployment 범용 Pod 상태 체크."""
from datetime import datetime

from app.models import StatusEnum
from app.services.checkers.base import BaseChecker, CheckResult

# addon.name → label_selector 매핑
_LABEL_MAP = {
    "Cilium CNI": "k8s-app=cilium",
    "Calico CNI": "k8s-app=calico-node",
    "CoreDNS": "k8s-app=kube-dns",
    "kube-proxy": "k8s-app=kube-proxy",
}

# DaemonSet 타입 (노드 대비 비율 체크)
_DAEMONSET_NAMES = {"Cilium CNI", "Calico CNI", "kube-proxy"}


class SystemPodChecker(BaseChecker):
    """
    addon.name 으로 label_selector를 결정하고,
    - DaemonSet: (Ready Pod / 전체 노드) 비율 체크
    - Deployment: 최소 1개 Ready 여부 체크
    """

    def check(self) -> CheckResult:
        start = datetime.utcnow()
        v1 = self._get_k8s_client()

        label = _LABEL_MAP.get(self.addon.name)
        if not label:
            # details에 check_playbook이 있으면 label로 사용
            label = self.addon.check_playbook or f"app={self.addon.name.lower()}"

        is_daemonset = self.addon.name in _DAEMONSET_NAMES

        # ── Pod 조회 (1 call) ──────────────────────────────
        pods = v1.list_namespaced_pod(
            namespace="kube-system",
            label_selector=label,
        )
        total_pods = len(pods.items)
        ready_pods = sum(
            1 for pod in pods.items
            if pod.status.phase == "Running"
            and all(cs.ready for cs in (pod.status.container_statuses or []))
        )

        elapsed = self._elapsed_ms(start)

        # ── DaemonSet: 노드 대비 비율 ─────────────────────
        if is_daemonset:
            nodes = v1.list_node()
            total_nodes = len(nodes.items)
            ratio = (ready_pods / total_nodes * 100) if total_nodes > 0 else 0

            details = {
                "ready_pods": ready_pods,
                "total_pods": total_pods,
                "total_nodes": total_nodes,
                "ratio_pct": round(ratio, 1),
                "kind": "daemonset",
                "label": label,
            }

            if ready_pods == 0:
                status = StatusEnum.critical
            elif ratio < 100:
                status = StatusEnum.warning
            else:
                status = StatusEnum.healthy

            return CheckResult(
                status=status,
                message=f"{self.addon.name} {ready_pods}/{total_nodes} nodes ({ratio:.0f}%)",
                response_time=elapsed,
                details=details,
            )

        # ── Deployment: 최소 1개 Ready ─────────────────────
        details = {
            "ready_pods": ready_pods,
            "total_pods": total_pods,
            "kind": "deployment",
            "label": label,
        }

        if total_pods == 0:
            status = StatusEnum.critical
        elif ready_pods == 0:
            status = StatusEnum.critical
        elif ready_pods < total_pods:
            status = StatusEnum.warning
        else:
            status = StatusEnum.healthy

        return CheckResult(
            status=status,
            message=f"{self.addon.name} {ready_pods}/{total_pods} Ready",
            response_time=elapsed,
            details=details,
        )
