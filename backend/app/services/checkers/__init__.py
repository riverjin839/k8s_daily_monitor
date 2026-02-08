from app.services.checkers.base import BaseChecker, CheckResult
from app.services.checkers.etcd_checker import EtcdChecker
from app.services.checkers.node_checker import NodeChecker
from app.services.checkers.control_plane_checker import ControlPlaneChecker
from app.services.checkers.system_pod_checker import SystemPodChecker

# addon.type → Checker 클래스 매핑
CHECKER_REGISTRY: dict[str, type[BaseChecker]] = {
    "etcd-leader": EtcdChecker,
    "node-check": NodeChecker,
    "control-plane": ControlPlaneChecker,
    "system-pod": SystemPodChecker,
}

__all__ = [
    "BaseChecker",
    "CheckResult",
    "EtcdChecker",
    "NodeChecker",
    "ControlPlaneChecker",
    "SystemPodChecker",
    "CHECKER_REGISTRY",
]
