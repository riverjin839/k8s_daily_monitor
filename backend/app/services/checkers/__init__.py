from app.services.checkers.base import BaseChecker, CheckResult
from app.services.checkers.etcd_checker import EtcdChecker
from app.services.checkers.node_checker import NodeChecker
from app.services.checkers.control_plane_checker import ControlPlaneChecker
from app.services.checkers.system_pod_checker import SystemPodChecker
from app.services.checkers.nexus_checker import NexusChecker
from app.services.checkers.jenkins_checker import JenkinsChecker
from app.services.checkers.argocd_checker import ArgoCDChecker
from app.services.checkers.keycloak_checker import KeycloakChecker

# addon.type → Checker 클래스 매핑
CHECKER_REGISTRY: dict[str, type[BaseChecker]] = {
    "etcd-leader": EtcdChecker,
    "node-check": NodeChecker,
    "control-plane": ControlPlaneChecker,
    "system-pod": SystemPodChecker,
    "nexus": NexusChecker,
    "jenkins": JenkinsChecker,
    "argocd": ArgoCDChecker,
    "keycloak": KeycloakChecker,
}

__all__ = [
    "BaseChecker",
    "CheckResult",
    "EtcdChecker",
    "NodeChecker",
    "ControlPlaneChecker",
    "SystemPodChecker",
    "NexusChecker",
    "JenkinsChecker",
    "ArgoCDChecker",
    "KeycloakChecker",
    "CHECKER_REGISTRY",
]
