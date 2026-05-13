"""Deep checker 레지스트리.

``check_type`` 문자열을 클래스에 매핑하고, UI 가 동적 form 을 그릴 수 있도록
파라미터/임계값 스키마를 함께 노출한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.deep_checkers.audit_rbac_checker import AuditRbacChecker
from app.services.deep_checkers.base import DeepCheckerBase
from app.services.deep_checkers.cert_expiry_checker import CertExpiryChecker
from app.services.deep_checkers.cni_flow_checker import CniFlowChecker
from app.services.deep_checkers.coredns_health_checker import CoreDnsHealthChecker
from app.services.deep_checkers.etcd_defrag_checker import EtcdDefragChecker
from app.services.deep_checkers.image_pull_checker import ImagePullChecker
from app.services.deep_checkers.node_pressure_checker import NodePressureChecker
from app.services.deep_checkers.oom_events_checker import OomEventsChecker
from app.services.deep_checkers.pod_to_pod_checker import PodToPodChecker
from app.services.deep_checkers.pvc_health_checker import PvcHealthChecker
from app.services.deep_checkers.stuck_terminating_checker import StuckTerminatingChecker


@dataclass
class DeepCheckFieldSpec:
    name: str
    type: str  # "int" | "float" | "string" | "boolean" | "list"
    label: str
    default: Any = None
    help: str | None = None


@dataclass
class DeepCheckTypeSpec:
    check_type: str
    display_name: str
    description: str
    threshold_fields: list[DeepCheckFieldSpec] = field(default_factory=list)
    param_fields: list[DeepCheckFieldSpec] = field(default_factory=list)
    default_thresholds: dict[str, Any] = field(default_factory=dict)
    default_params: dict[str, Any] = field(default_factory=dict)


REGISTRY: dict[str, tuple[type[DeepCheckerBase], DeepCheckTypeSpec]] = {
    "cert_expiry": (
        CertExpiryChecker,
        DeepCheckTypeSpec(
            check_type="cert_expiry",
            display_name="K8s 인증서 만료",
            description="kubeadm certs check-expiration 으로 컨트롤 플레인 인증서 잔여일 점검",
            threshold_fields=[
                DeepCheckFieldSpec("warning_days", "int", "경고 (일)", 30,
                                   help="잔여일이 이 값 이하면 warning"),
                DeepCheckFieldSpec("critical_days", "int", "심각 (일)", 7,
                                   help="잔여일이 이 값 이하면 critical"),
            ],
            default_thresholds={"warning_days": 30, "critical_days": 7},
            default_params={},
        ),
    ),
    "etcd_defrag": (
        EtcdDefragChecker,
        DeepCheckTypeSpec(
            check_type="etcd_defrag",
            display_name="etcd 단편화 / 알람",
            description="etcdctl endpoint status + alarm list 로 단편화율과 alarm 점검",
            threshold_fields=[
                DeepCheckFieldSpec("warning_fragmentation_pct", "float", "단편화 경고 (%)", 30),
                DeepCheckFieldSpec("critical_fragmentation_pct", "float", "단편화 심각 (%)", 50),
            ],
            default_thresholds={
                "warning_fragmentation_pct": 30,
                "critical_fragmentation_pct": 50,
            },
            default_params={},
        ),
    ),
    "cni_flow": (
        CniFlowChecker,
        DeepCheckTypeSpec(
            check_type="cni_flow",
            display_name="Cilium Hubble flow",
            description="최근 N초간 Hubble 플로우 중 DROPPED/ERROR 비율 점검",
            threshold_fields=[
                DeepCheckFieldSpec("warning_drop_pct", "float", "drop 경고 (%)", 2),
                DeepCheckFieldSpec("critical_drop_pct", "float", "drop 심각 (%)", 5),
            ],
            param_fields=[
                DeepCheckFieldSpec("last_seconds", "int", "관측 윈도 (초)", 60),
                DeepCheckFieldSpec("flow_limit", "int", "최대 flow 수", 1000),
            ],
            default_thresholds={"warning_drop_pct": 2, "critical_drop_pct": 5},
            default_params={"last_seconds": 60, "flow_limit": 1000},
        ),
    ),
    "pvc_health": (
        PvcHealthChecker,
        DeepCheckTypeSpec(
            check_type="pvc_health",
            display_name="PVC / PV 상태",
            description="Pending/Lost PVC 와 orphan PV 점검",
            threshold_fields=[
                DeepCheckFieldSpec("warning_pending", "int", "Pending 경고 (건)", 1),
                DeepCheckFieldSpec("critical_pending", "int", "Pending 심각 (건)", 5),
            ],
            default_thresholds={"warning_pending": 1, "critical_pending": 5},
            default_params={},
        ),
    ),
    "image_pull": (
        ImagePullChecker,
        DeepCheckTypeSpec(
            check_type="image_pull",
            display_name="ImagePull / CrashLoop",
            description="ImagePullBackOff / ErrImagePull / CrashLoopBackOff 카운트",
            threshold_fields=[
                DeepCheckFieldSpec("warning_pull_failures", "int", "이미지 풀 경고 (건)", 1),
                DeepCheckFieldSpec("critical_pull_failures", "int", "이미지 풀 심각 (건)", 5),
                DeepCheckFieldSpec("warning_crash_loops", "int", "CrashLoop 경고 (건)", 1),
                DeepCheckFieldSpec("critical_crash_loops", "int", "CrashLoop 심각 (건)", 5),
            ],
            param_fields=[
                DeepCheckFieldSpec("log_tail_lines", "int", "로그 tail 라인 수", 20),
            ],
            default_thresholds={
                "warning_pull_failures": 1,
                "critical_pull_failures": 5,
                "warning_crash_loops": 1,
                "critical_crash_loops": 5,
            },
            default_params={"log_tail_lines": 20},
        ),
    ),
    "audit_rbac": (
        AuditRbacChecker,
        DeepCheckTypeSpec(
            check_type="audit_rbac",
            display_name="Audit / RBAC sprawl",
            description="Audit policy ConfigMap 존재와 cluster-admin 수 점검",
            threshold_fields=[
                DeepCheckFieldSpec("warning_cluster_admins", "int", "cluster-admin 경고 (명)", 5),
                DeepCheckFieldSpec("critical_cluster_admins", "int", "cluster-admin 심각 (명)", 15),
            ],
            param_fields=[
                DeepCheckFieldSpec("audit_namespace", "string", "Audit ConfigMap 네임스페이스", "kube-system"),
                DeepCheckFieldSpec("audit_configmap_name", "string", "Audit ConfigMap 이름", "audit-policy"),
            ],
            default_thresholds={
                "warning_cluster_admins": 5,
                "critical_cluster_admins": 15,
            },
            default_params={
                "audit_namespace": "kube-system",
                "audit_configmap_name": "audit-policy",
            },
        ),
    ),
    "node_pressure": (
        NodePressureChecker,
        DeepCheckTypeSpec(
            check_type="node_pressure",
            display_name="노드 Pressure / Condition",
            description="DiskPressure / MemoryPressure / PIDPressure / NetworkUnavailable / NotReady 점검",
            threshold_fields=[
                DeepCheckFieldSpec("warning_count", "int", "영향 노드 경고 (개)", 1),
                DeepCheckFieldSpec("critical_count", "int", "영향 노드 심각 (개)", 3),
            ],
            default_thresholds={"warning_count": 1, "critical_count": 3},
            default_params={},
        ),
    ),
    "coredns_health": (
        CoreDnsHealthChecker,
        DeepCheckTypeSpec(
            check_type="coredns_health",
            display_name="CoreDNS 상태",
            description="kube-dns 파드 Ready 비율 + 최근 로그에서 error/failed 라인 비율",
            threshold_fields=[
                DeepCheckFieldSpec("warning_error_rate_pct", "float", "에러율 경고 (%)", 1),
                DeepCheckFieldSpec("critical_error_rate_pct", "float", "에러율 심각 (%)", 5),
            ],
            param_fields=[
                DeepCheckFieldSpec("namespace", "string", "네임스페이스", "kube-system"),
                DeepCheckFieldSpec("label_selector", "string", "Pod label selector", "k8s-app=kube-dns"),
                DeepCheckFieldSpec("log_tail_lines", "int", "로그 tail 라인 수", 500),
            ],
            default_thresholds={
                "warning_error_rate_pct": 1,
                "critical_error_rate_pct": 5,
            },
            default_params={
                "namespace": "kube-system",
                "label_selector": "k8s-app=kube-dns",
                "log_tail_lines": 500,
            },
        ),
    ),
    "stuck_terminating": (
        StuckTerminatingChecker,
        DeepCheckTypeSpec(
            check_type="stuck_terminating",
            display_name="Stuck Terminating Pods",
            description="Terminating 상태로 N분 이상 머무는 pod 검출",
            threshold_fields=[
                DeepCheckFieldSpec("warning_minutes", "int", "경고 (분)", 5),
                DeepCheckFieldSpec("critical_minutes", "int", "심각 (분)", 30),
            ],
            default_thresholds={"warning_minutes": 5, "critical_minutes": 30},
            default_params={},
        ),
    ),
    "oom_events": (
        OomEventsChecker,
        DeepCheckTypeSpec(
            check_type="oom_events",
            display_name="OOM / Evicted 이벤트",
            description="최근 N시간 Warning 이벤트 중 OOMKilling / Evicted / SystemOOM 카운트",
            threshold_fields=[
                DeepCheckFieldSpec("warning_count", "int", "경고 (건)", 1),
                DeepCheckFieldSpec("critical_count", "int", "심각 (건)", 5),
            ],
            param_fields=[
                DeepCheckFieldSpec("window_hours", "int", "관측 윈도 (시간)", 24),
            ],
            default_thresholds={"warning_count": 1, "critical_count": 5},
            default_params={"window_hours": 24},
        ),
    ),
    "pod_to_pod": (
        PodToPodChecker,
        DeepCheckTypeSpec(
            check_type="pod_to_pod",
            display_name="Pod-to-pod 연결성",
            description=(
                "일회용 busybox 파드를 띄워 무작위 워크로드 파드 IP:포트 로 "
                "nc TCP probe 를 돌려 실패율 점검 (pods.create 권한 필요)"
            ),
            threshold_fields=[
                DeepCheckFieldSpec("warning_failure_pct", "float", "실패율 경고 (%)", 10),
                DeepCheckFieldSpec("critical_failure_pct", "float", "실패율 심각 (%)", 30),
            ],
            param_fields=[
                DeepCheckFieldSpec("targets_max", "int", "샘플링할 타깃 pod 개수", 8),
                DeepCheckFieldSpec("per_probe_timeout", "int", "probe 1건 timeout (초)", 3),
                DeepCheckFieldSpec("probe_namespace", "string", "probe pod 가 생성될 namespace", "default"),
                DeepCheckFieldSpec("image", "string", "probe 컨테이너 이미지", "busybox:1.36"),
                DeepCheckFieldSpec("skip_host_network", "boolean", "hostNetwork pod 제외", True),
                DeepCheckFieldSpec("namespaces", "list", "대상 namespace 화이트리스트 (빈값=전체)", []),
            ],
            default_thresholds={"warning_failure_pct": 10, "critical_failure_pct": 30},
            default_params={
                "targets_max": 8,
                "per_probe_timeout": 3,
                "probe_namespace": "default",
                "image": "busybox:1.36",
                "skip_host_network": True,
                "namespaces": [],
            },
        ),
    ),
}


def get_checker_class(check_type: str) -> type[DeepCheckerBase] | None:
    entry = REGISTRY.get(check_type)
    return entry[0] if entry else None


def list_check_types() -> list[dict[str, Any]]:
    """UI 에서 동적 form 을 그리기 위한 직렬화."""
    out: list[dict[str, Any]] = []
    for ct, (_, spec) in REGISTRY.items():
        out.append({
            "check_type": ct,
            "display_name": spec.display_name,
            "description": spec.description,
            "threshold_fields": [_field_to_dict(f) for f in spec.threshold_fields],
            "param_fields": [_field_to_dict(f) for f in spec.param_fields],
            "default_thresholds": spec.default_thresholds,
            "default_params": spec.default_params,
        })
    return out


def _field_to_dict(f: DeepCheckFieldSpec) -> dict[str, Any]:
    return {
        "name": f.name,
        "type": f.type,
        "label": f.label,
        "default": f.default,
        "help": f.help,
    }
