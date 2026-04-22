"""Cilium + Kubernetes NetworkPolicy 정책 해석.

각 홉에서 "이 pod 에 어떤 정책이 적용되고, 주어진 트래픽이 allow/deny 인지"
를 판단한다. 엄밀한 eBPF 수준의 판정이 아니라, 선언된 정책의 podSelector /
endpointSelector / from/to / ports 를 규칙 기반으로 매칭한다.

의존: `kubernetes` Python SDK (이미 설치됨). Cilium CRD 는 CustomObjectsApi
로 접근.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from kubernetes import client as k8s_client


CILIUM_GROUP = "cilium.io"
CILIUM_V2 = "v2"


@dataclass
class PolicyMatch:
    """특정 pod 에 매치된 정책 + 해당 방향(ingress/egress) 규칙."""
    kind: str                   # "CiliumNetworkPolicy" | "CiliumClusterwideNetworkPolicy" | "NetworkPolicy"
    name: str                   # "namespace/name" 또는 clusterwide 는 "name"
    direction: str              # "ingress" | "egress"
    selector_labels: dict[str, str] = field(default_factory=dict)
    raw_rule: dict[str, Any] = field(default_factory=dict)
    summary: str = ""           # 사람이 읽기 쉬운 요약 (UI 표시용)


@dataclass
class PolicyDecision:
    allowed: bool | None        # None = 판단 불가(정책 없음 → default allow or policy enforcement 설정에 따라)
    matched: list[PolicyMatch] = field(default_factory=list)
    reason: str = ""
    enforcement: str = "default"  # "default" | "always" | "never" — Cilium 에서 설정 가능


def _labels_match(selector: dict[str, str] | None, labels: dict[str, str] | None) -> bool:
    if not selector:
        return True     # 빈 selector = match all
    if not labels:
        return False
    return all(labels.get(k) == v for k, v in selector.items())


class CiliumPolicyAnalyzer:
    """한 클러스터에서 정책들을 pre-fetch 후 pod 단위로 매칭."""

    def __init__(self, core: k8s_client.CoreV1Api, net: k8s_client.NetworkingV1Api,
                 custom: k8s_client.CustomObjectsApi):
        self.core = core
        self.net = net
        self.custom = custom
        self._cnp_cache: list[dict] | None = None
        self._ccnp_cache: list[dict] | None = None
        self._knp_cache: list[dict] | None = None
        self._identity_cache: dict[str, dict] = {}
        self._endpoint_cache: dict[str, dict] = {}    # "ns/pod" → endpoint
        self._cilium_config_cache: dict[str, str] | None = None

    # ── Prefetch ─────────────────────────────────────────────────────────────

    def _load_cnps(self) -> list[dict]:
        if self._cnp_cache is not None:
            return self._cnp_cache
        try:
            raw = self.custom.list_cluster_custom_object(
                group=CILIUM_GROUP, version=CILIUM_V2,
                plural="ciliumnetworkpolicies", _request_timeout=10,
            )
            self._cnp_cache = raw.get("items") or []
        except Exception:
            self._cnp_cache = []
        return self._cnp_cache

    def _load_ccnps(self) -> list[dict]:
        if self._ccnp_cache is not None:
            return self._ccnp_cache
        try:
            raw = self.custom.list_cluster_custom_object(
                group=CILIUM_GROUP, version=CILIUM_V2,
                plural="ciliumclusterwidenetworkpolicies", _request_timeout=10,
            )
            self._ccnp_cache = raw.get("items") or []
        except Exception:
            self._ccnp_cache = []
        return self._ccnp_cache

    def _load_knps(self) -> list[dict]:
        if self._knp_cache is not None:
            return self._knp_cache
        try:
            raw = self.net.list_network_policy_for_all_namespaces(_request_timeout=10)
            # convert to plain dict (selector 만 쓸 용도)
            self._knp_cache = [
                {
                    "metadata": {"namespace": p.metadata.namespace, "name": p.metadata.name},
                    "spec": p.spec.to_dict() if p.spec else {},
                }
                for p in (raw.items or [])
            ]
        except Exception:
            self._knp_cache = []
        return self._knp_cache

    def get_cilium_config(self) -> dict[str, str]:
        if self._cilium_config_cache is not None:
            return self._cilium_config_cache
        try:
            cm = self.core.read_namespaced_config_map(name="cilium-config", namespace="kube-system",
                                                     _request_timeout=10)
            self._cilium_config_cache = dict(cm.data or {})
        except Exception:
            self._cilium_config_cache = {}
        return self._cilium_config_cache

    def get_endpoint(self, namespace: str, pod_name: str) -> dict | None:
        key = f"{namespace}/{pod_name}"
        if key in self._endpoint_cache:
            return self._endpoint_cache[key]
        try:
            raw = self.custom.list_namespaced_custom_object(
                group=CILIUM_GROUP, version=CILIUM_V2, namespace=namespace,
                plural="ciliumendpoints", _request_timeout=10,
            )
            for item in (raw.get("items") or []):
                if (item.get("metadata", {}) or {}).get("name") == pod_name:
                    self._endpoint_cache[key] = item
                    return item
        except Exception:
            pass
        self._endpoint_cache[key] = None  # type: ignore[assignment]
        return None

    def get_identity(self, identity_id: str | int | None) -> dict | None:
        if identity_id is None:
            return None
        key = str(identity_id)
        if key in self._identity_cache:
            return self._identity_cache[key]
        try:
            obj = self.custom.get_cluster_custom_object(
                group=CILIUM_GROUP, version=CILIUM_V2,
                plural="ciliumidentities", name=key, _request_timeout=10,
            )
            self._identity_cache[key] = obj
            return obj
        except Exception:
            self._identity_cache[key] = None  # type: ignore[assignment]
            return None

    # ── Matching ─────────────────────────────────────────────────────────────

    def _matches_endpoint_selector(self, sel: dict | None, pod_labels: dict[str, str], pod_ns: str) -> bool:
        """Cilium endpointSelector (matchLabels) 매칭.

        Cilium 은 k8s:io.kubernetes.pod.namespace 로 namespace 를 라벨 처럼 씀.
        """
        if not sel:
            return True
        labels = sel.get("matchLabels") or {}
        # namespace 스코프 체크
        ns_label_keys = ("k8s:io.kubernetes.pod.namespace", "io.kubernetes.pod.namespace")
        for k, v in labels.items():
            if k in ns_label_keys:
                if v != pod_ns:
                    return False
                continue
            # k8s: prefix 제거 후 pod 라벨과 비교
            real_key = k.removeprefix("k8s:").removeprefix("any:")
            if pod_labels.get(real_key) != v:
                return False
        return True

    def _cnp_matches_pod(self, policy: dict, pod_labels: dict[str, str], pod_ns: str,
                        clusterwide: bool) -> bool:
        spec = policy.get("spec") or {}
        meta = policy.get("metadata") or {}
        if not clusterwide and meta.get("namespace") != pod_ns:
            return False
        # endpointSelector (CNP) 또는 nodeSelector (not handled here)
        ep_sel = spec.get("endpointSelector")
        if ep_sel and not self._matches_endpoint_selector(ep_sel, pod_labels, pod_ns):
            return False
        return True

    def _knp_matches_pod(self, policy: dict, pod_labels: dict[str, str], pod_ns: str) -> bool:
        meta = policy.get("metadata") or {}
        if meta.get("namespace") != pod_ns:
            return False
        spec = policy.get("spec") or {}
        pod_selector = (spec.get("pod_selector") or spec.get("podSelector") or {}).get("match_labels") or {}
        # Python SDK 는 snake_case 로 변환하지만, 혹시 원형이면 matchLabels 도 봄
        if not pod_selector:
            pod_selector = (spec.get("pod_selector") or spec.get("podSelector") or {}).get("matchLabels") or {}
        return _labels_match(pod_selector, pod_labels)

    # ── Public API ───────────────────────────────────────────────────────────

    def analyze_for_pod(self, pod: k8s_client.V1Pod) -> dict:
        """해당 pod 에 적용 가능한 CNP/KNP 를 나열하고 Cilium endpoint/identity 를 첨부."""
        pod_labels = dict(pod.metadata.labels or {})
        pod_ns = pod.metadata.namespace
        pod_name = pod.metadata.name

        matched_ingress: list[PolicyMatch] = []
        matched_egress: list[PolicyMatch] = []

        # CNP (namespaced)
        for p in self._load_cnps():
            if not self._cnp_matches_pod(p, pod_labels, pod_ns, clusterwide=False):
                continue
            spec = p.get("spec") or {}
            meta = p.get("metadata") or {}
            name = f"{meta.get('namespace', '?')}/{meta.get('name', '?')}"
            for rule in (spec.get("ingress") or []):
                matched_ingress.append(PolicyMatch(
                    kind="CiliumNetworkPolicy", name=name, direction="ingress",
                    selector_labels=(spec.get("endpointSelector") or {}).get("matchLabels") or {},
                    raw_rule=rule, summary=_summarize_cnp_rule(rule, "ingress"),
                ))
            for rule in (spec.get("egress") or []):
                matched_egress.append(PolicyMatch(
                    kind="CiliumNetworkPolicy", name=name, direction="egress",
                    selector_labels=(spec.get("endpointSelector") or {}).get("matchLabels") or {},
                    raw_rule=rule, summary=_summarize_cnp_rule(rule, "egress"),
                ))

        # CCNP (clusterwide)
        for p in self._load_ccnps():
            if not self._cnp_matches_pod(p, pod_labels, pod_ns, clusterwide=True):
                continue
            spec = p.get("spec") or {}
            name = (p.get("metadata") or {}).get("name", "?")
            for rule in (spec.get("ingress") or []):
                matched_ingress.append(PolicyMatch(
                    kind="CiliumClusterwideNetworkPolicy", name=name, direction="ingress",
                    raw_rule=rule, summary=_summarize_cnp_rule(rule, "ingress"),
                ))
            for rule in (spec.get("egress") or []):
                matched_egress.append(PolicyMatch(
                    kind="CiliumClusterwideNetworkPolicy", name=name, direction="egress",
                    raw_rule=rule, summary=_summarize_cnp_rule(rule, "egress"),
                ))

        # KNP
        for p in self._load_knps():
            if not self._knp_matches_pod(p, pod_labels, pod_ns):
                continue
            meta = p.get("metadata") or {}
            name = f"{meta.get('namespace')}/{meta.get('name')}"
            spec = p.get("spec") or {}
            policy_types = spec.get("policy_types") or spec.get("policyTypes") or ["Ingress"]
            if "Ingress" in policy_types:
                for r in (spec.get("ingress") or []):
                    matched_ingress.append(PolicyMatch(
                        kind="NetworkPolicy", name=name, direction="ingress",
                        raw_rule=r, summary=_summarize_knp_rule(r, "ingress"),
                    ))
            if "Egress" in policy_types:
                for r in (spec.get("egress") or []):
                    matched_egress.append(PolicyMatch(
                        kind="NetworkPolicy", name=name, direction="egress",
                        raw_rule=r, summary=_summarize_knp_rule(r, "egress"),
                    ))

        endpoint = self.get_endpoint(pod_ns, pod_name)
        identity_id = None
        if endpoint:
            status = endpoint.get("status") or {}
            ident = status.get("identity") or {}
            identity_id = ident.get("id")
        identity = self.get_identity(identity_id) if identity_id else None

        # default enforcement → Cilium 기본은 allow-all, 정책 있으면 해당 방향은 deny-by-default
        has_ingress = len(matched_ingress) > 0
        has_egress = len(matched_egress) > 0

        return {
            "ingress_policies": [_match_to_dict(m) for m in matched_ingress],
            "egress_policies": [_match_to_dict(m) for m in matched_egress],
            "endpoint_identity": identity_id,
            "endpoint_labels": (endpoint or {}).get("status", {}).get("identity", {}).get("labels", []),
            "identity": identity,
            "ingress_deny_by_default": has_ingress,
            "egress_deny_by_default": has_egress,
        }


# ── rule summarization (사람이 읽기 쉬운 한 줄) ──────────────────────────────

def _summarize_cnp_rule(rule: dict, direction: str) -> str:
    peers = []
    key = "fromEndpoints" if direction == "ingress" else "toEndpoints"
    for ep in (rule.get(key) or []):
        labels = (ep.get("matchLabels") or {})
        if labels:
            peers.append(", ".join(f"{k}={v}" for k, v in labels.items()))
        else:
            peers.append("(any)")
    for entity in (rule.get("fromEntities" if direction == "ingress" else "toEntities") or []):
        peers.append(f"entity={entity}")
    for cidr in (rule.get("fromCIDR" if direction == "ingress" else "toCIDR") or []):
        peers.append(f"cidr={cidr}")
    ports: list[str] = []
    port_key = "toPorts"
    for pblock in (rule.get(port_key) or []):
        for port in (pblock.get("ports") or []):
            p = port.get("port")
            proto = port.get("protocol", "TCP")
            ports.append(f"{p}/{proto}")
    if not peers:
        peers.append("(any)")
    peer_s = " | ".join(peers[:3]) + (" …" if len(peers) > 3 else "")
    port_s = ", ".join(ports) if ports else "(all ports)"
    return f"{direction}: {peer_s} → {port_s}"


def _summarize_knp_rule(rule: dict, direction: str) -> str:
    peers_key = "from" if direction == "ingress" else "to"
    peers = []
    for p in (rule.get(peers_key) or []):
        if p.get("podSelector") is not None or p.get("pod_selector") is not None:
            sel = (p.get("podSelector") or p.get("pod_selector") or {})
            labels = sel.get("matchLabels") or sel.get("match_labels") or {}
            peers.append("pod[" + ", ".join(f"{k}={v}" for k, v in labels.items()) + "]" if labels else "(any pod)")
        if p.get("namespaceSelector") is not None or p.get("namespace_selector") is not None:
            peers.append("ns-selector")
        ip_block = p.get("ipBlock") or p.get("ip_block")
        if ip_block:
            peers.append(f"cidr={ip_block.get('cidr')}")
    ports = []
    for pp in (rule.get("ports") or []):
        ports.append(f"{pp.get('port')}/{pp.get('protocol', 'TCP')}")
    if not peers:
        peers.append("(any)")
    peer_s = " | ".join(peers[:3]) + (" …" if len(peers) > 3 else "")
    port_s = ", ".join(ports) if ports else "(all ports)"
    return f"{direction}: {peer_s} → {port_s}"


def _match_to_dict(m: PolicyMatch) -> dict:
    return {
        "kind": m.kind,
        "name": m.name,
        "direction": m.direction,
        "summary": m.summary,
        "selector_labels": m.selector_labels,
    }
