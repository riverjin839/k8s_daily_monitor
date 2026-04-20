import os
from dataclasses import dataclass
from typing import Optional

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from sqlalchemy.orm import Session

from app.models.cluster import Cluster
from app.models.infra_node import InfraNode


@dataclass
class TraceTarget:
    target_type: str
    target_name: str


@dataclass
class PacketFlowRequest:
    host: str
    path: str = "/"
    protocol: str = "https"


class TopologyTraceService:
    def __init__(self, db: Session, cluster: Cluster):
        self.db = db
        self.cluster = cluster
        self._core_v1: client.CoreV1Api | None = None
        self._discovery_v1: client.DiscoveryV1Api | None = None

    def _load_config(self) -> None:
        kubeconfig = self.cluster.kubeconfig_path
        if kubeconfig and os.path.exists(kubeconfig):
            config.load_kube_config(config_file=kubeconfig)
            return

        try:
            config.load_incluster_config()
        except config.ConfigException as e:
            if kubeconfig:
                raise ValueError(f"kubeconfig 파일을 찾을 수 없습니다: '{kubeconfig}'") from e
            raise ValueError(
                f"클러스터 '{self.cluster.name}'에 kubeconfig_path가 설정되지 않았고 in-cluster 환경도 아닙니다"
            ) from e

    def _get_clients(self) -> tuple[client.CoreV1Api, client.DiscoveryV1Api]:
        if self._core_v1 and self._discovery_v1:
            return self._core_v1, self._discovery_v1

        self._load_config()
        self._core_v1 = client.CoreV1Api()
        self._discovery_v1 = client.DiscoveryV1Api()
        return self._core_v1, self._discovery_v1

    def _get_networking_client(self) -> client.NetworkingV1Api:
        self._load_config()
        return client.NetworkingV1Api()

    @staticmethod
    def _safe_error_count(pod: client.V1Pod | None, node: client.V1Node | None) -> int | None:
        if pod and pod.status and pod.status.container_statuses:
            return sum(cs.restart_count or 0 for cs in pod.status.container_statuses)

        if node and node.status and node.status.conditions:
            not_ready = [c for c in node.status.conditions if c.type == "Ready" and c.status != "True"]
            return len(not_ready)

        return None

    @staticmethod
    def _safe_latency_ms(pod: client.V1Pod | None, node: client.V1Node | None) -> float | None:
        source = None
        if pod and pod.metadata and pod.metadata.annotations:
            source = pod.metadata.annotations
        elif node and node.metadata and node.metadata.annotations:
            source = node.metadata.annotations

        if not source:
            return None

        for key in ("monitoring.k8s.io/latency-ms", "topology.k8s.io/latency-ms", "latency_ms"):
            if key in source:
                try:
                    return float(source[key])
                except (TypeError, ValueError):
                    return None
        return None

    @staticmethod
    def _resolve_interface(node_obj: client.V1Node | None, infra_node: InfraNode | None) -> str | None:
        if node_obj and node_obj.metadata and node_obj.metadata.annotations:
            annotations = node_obj.metadata.annotations
            for key in ("topology.k8s.io/uplink-port", "network.kubernetes.io/uplink"):
                if key in annotations:
                    return annotations[key]

        if infra_node and infra_node.notes:
            for line in infra_node.notes.splitlines():
                line = line.strip()
                if line.lower().startswith("port:"):
                    return line.split(":", 1)[1].strip() or None

        return None

    def _build_hop(
        self,
        *,
        entity_type: str,
        entity_id: str,
        name: str,
        interface: str | None = None,
        latency_ms: float | None = None,
        error_count: int | None = None,
    ) -> dict:
        return {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "name": name,
            "interface": interface,
            "latency_ms": latency_ms,
            "error_count": error_count,
        }

    def _get_pod(self, namespace: str, pod_name: str) -> client.V1Pod:
        core_v1, _ = self._get_clients()
        return core_v1.read_namespaced_pod(name=pod_name, namespace=namespace)

    def _get_service_backend_pod(self, namespace: str, service_name: str) -> client.V1Pod:
        core_v1, discovery_v1 = self._get_clients()

        slices = discovery_v1.list_namespaced_endpoint_slice(
            namespace=namespace,
            label_selector=f"kubernetes.io/service-name={service_name}",
        )

        for eps in slices.items:
            for endpoint in eps.endpoints or []:
                target_ref = endpoint.target_ref
                if target_ref and target_ref.kind == "Pod" and target_ref.name:
                    return core_v1.read_namespaced_pod(name=target_ref.name, namespace=namespace)

        raise ValueError(f"service '{service_name}'에 연결된 endpoint pod를 찾지 못했습니다")

    def trace(self, namespace: str, target: TraceTarget) -> list[dict]:
        core_v1, _ = self._get_clients()

        if target.target_type not in {"service", "pod"}:
            raise ValueError("target_type은 'service' 또는 'pod' 이어야 합니다")

        if target.target_type == "pod":
            pod = self._get_pod(namespace, target.target_name)
            entry_hop = self._build_hop(
                entity_type="pod",
                entity_id=pod.metadata.uid,
                name=pod.metadata.name,
                interface=pod.status.pod_ip,
                latency_ms=self._safe_latency_ms(pod, None),
                error_count=self._safe_error_count(pod, None),
            )
        else:
            pod = self._get_service_backend_pod(namespace, target.target_name)
            entry_hop = self._build_hop(
                entity_type="service",
                entity_id=target.target_name,
                name=target.target_name,
                interface=None,
                latency_ms=None,
                error_count=None,
            )

        if not pod.spec or not pod.spec.node_name:
            raise ValueError(f"pod '{pod.metadata.name}' 의 node 정보를 찾지 못했습니다")

        node = core_v1.read_node(name=pod.spec.node_name)
        infra_node = self.db.query(InfraNode).filter(
            InfraNode.cluster_id == self.cluster.id,
            InfraNode.hostname == node.metadata.name,
        ).first()

        hops: list[dict] = [entry_hop]

        if target.target_type == "service":
            hops.append(
                self._build_hop(
                    entity_type="pod",
                    entity_id=pod.metadata.uid,
                    name=pod.metadata.name,
                    interface=pod.status.pod_ip,
                    latency_ms=self._safe_latency_ms(pod, None),
                    error_count=self._safe_error_count(pod, None),
                )
            )

        node_interface = self._resolve_interface(node, infra_node)
        hops.append(
            self._build_hop(
                entity_type="node",
                entity_id=node.metadata.uid,
                name=node.metadata.name,
                interface=node_interface,
                latency_ms=self._safe_latency_ms(None, node),
                error_count=self._safe_error_count(None, node),
            )
        )

        switch_name = infra_node.switch_name if infra_node and infra_node.switch_name else "unknown-switch"
        hops.append(
            self._build_hop(
                entity_type="switch",
                entity_id=switch_name,
                name=switch_name,
                interface=node_interface,
                latency_ms=None,
                error_count=None,
            )
        )

        link_id = f"{node.metadata.name}:{node_interface or 'uplink'}->{switch_name}"
        hops.append(
            self._build_hop(
                entity_type="link",
                entity_id=link_id,
                name=link_id,
                interface=node_interface,
                latency_ms=None,
                error_count=None,
            )
        )

        return hops

    # ── Packet flow (외부 client → 내부 pod) ──────────────────────────
    def _find_ingress_for_host(
        self, host: str, path: str
    ) -> tuple[client.V1Ingress, client.V1IngressBackend, str]:
        """Search all namespaces for an Ingress matching the given host/path."""
        networking_v1 = self._get_networking_client()
        ingresses = networking_v1.list_ingress_for_all_namespaces()

        for ing in ingresses.items:
            for rule in ing.spec.rules or []:
                rule_host = getattr(rule, "host", None)
                if rule_host and rule_host != host:
                    continue
                http = getattr(rule, "http", None)
                if not http or not http.paths:
                    continue
                for p in http.paths:
                    p_path = p.path or "/"
                    if path == p_path or path.startswith(p_path.rstrip("*")):
                        return ing, p.backend, ing.metadata.namespace

        raise ValueError(f"host '{host}' path '{path}'에 매칭되는 Ingress를 찾지 못했습니다")

    def _get_service(self, namespace: str, service_name: str) -> client.V1Service:
        core_v1, _ = self._get_clients()
        return core_v1.read_namespaced_service(name=service_name, namespace=namespace)

    def _service_entry_info(self, svc: client.V1Service) -> tuple[str, Optional[str]]:
        """Return (entry_label, external_address) describing the service entry type."""
        spec = svc.spec
        svc_type = spec.type or "ClusterIP"

        if svc_type == "LoadBalancer":
            lb = svc.status.load_balancer if svc.status else None
            if lb and lb.ingress:
                ext = lb.ingress[0]
                addr = ext.ip or ext.hostname
                return ("LoadBalancer", addr)
            return ("LoadBalancer", None)

        if svc_type == "NodePort":
            ports = spec.ports or []
            node_ports = [str(p.node_port) for p in ports if p.node_port]
            return ("NodePort", f":{','.join(node_ports)}" if node_ports else None)

        return ("ClusterIP", spec.cluster_ip)

    def _find_ingress_controller_pod(self, ing: client.V1Ingress) -> Optional[client.V1Pod]:
        """Try to locate an Ingress-controller pod via IngressClass → controller deploy."""
        core_v1, _ = self._get_clients()

        class_name = (
            ing.spec.ingress_class_name
            or (ing.metadata.annotations or {}).get("kubernetes.io/ingress.class")
        )

        selectors = [
            "app.kubernetes.io/name=ingress-nginx",
            "app.kubernetes.io/component=controller",
            "app=istio-ingressgateway",
            "app=traefik",
        ]
        if class_name:
            selectors.insert(0, f"app.kubernetes.io/instance={class_name}")

        for selector in selectors:
            pods = core_v1.list_pod_for_all_namespaces(label_selector=selector, limit=1)
            if pods.items:
                return pods.items[0]
        return None

    def trace_packet_flow(self, req: PacketFlowRequest) -> list[dict]:
        """Trace the full E2E packet path: external client → pod → switch."""
        core_v1, _ = self._get_clients()

        hops: list[dict] = []

        # 1. External client
        hops.append(
            self._build_hop(
                entity_type="client",
                entity_id="external-client",
                name="External Client",
                interface=f"{req.protocol}://{req.host}{req.path}",
            )
        )

        # 2. DNS (logical hop)
        hops.append(
            self._build_hop(
                entity_type="dns",
                entity_id=req.host,
                name=req.host,
                interface="DNS lookup",
            )
        )

        # 3. Ingress resource lookup
        ing, backend, ing_ns = self._find_ingress_for_host(req.host, req.path)

        # 4. Ingress Controller pod (LB / NodePort entry)
        ctrl_pod = self._find_ingress_controller_pod(ing)
        if ctrl_pod:
            hops.append(
                self._build_hop(
                    entity_type="ingress_controller",
                    entity_id=ctrl_pod.metadata.uid,
                    name=f"{ctrl_pod.metadata.namespace}/{ctrl_pod.metadata.name}",
                    interface=ctrl_pod.status.pod_ip if ctrl_pod.status else None,
                    latency_ms=self._safe_latency_ms(ctrl_pod, None),
                    error_count=self._safe_error_count(ctrl_pod, None),
                )
            )
        else:
            hops.append(
                self._build_hop(
                    entity_type="ingress_controller",
                    entity_id="unknown-ingress",
                    name="Ingress Controller (unknown)",
                )
            )

        # 5. Ingress resource
        hops.append(
            self._build_hop(
                entity_type="ingress",
                entity_id=ing.metadata.uid,
                name=f"{ing_ns}/{ing.metadata.name}",
                interface=f"{req.host}{req.path}",
            )
        )

        # 6. Service
        svc_ref = backend.service
        if not svc_ref or not svc_ref.name:
            raise ValueError("Ingress backend에 service 정보가 없습니다")

        svc = self._get_service(ing_ns, svc_ref.name)
        entry_label, ext_addr = self._service_entry_info(svc)
        svc_port = svc_ref.port.number if svc_ref.port else None
        svc_interface = f"{svc.spec.cluster_ip}:{svc_port}" if svc_port else svc.spec.cluster_ip

        hops.append(
            self._build_hop(
                entity_type="service",
                entity_id=svc.metadata.uid,
                name=f"{ing_ns}/{svc.metadata.name} ({entry_label})",
                interface=ext_addr or svc_interface,
            )
        )

        # 7. Backend pod (via EndpointSlice)
        pod = self._get_service_backend_pod(ing_ns, svc.metadata.name)
        hops.append(
            self._build_hop(
                entity_type="pod",
                entity_id=pod.metadata.uid,
                name=f"{pod.metadata.namespace}/{pod.metadata.name}",
                interface=pod.status.pod_ip if pod.status else None,
                latency_ms=self._safe_latency_ms(pod, None),
                error_count=self._safe_error_count(pod, None),
            )
        )

        if not pod.spec or not pod.spec.node_name:
            raise ValueError(f"pod '{pod.metadata.name}' 의 node 정보를 찾지 못했습니다")

        # 8. Node
        node = core_v1.read_node(name=pod.spec.node_name)
        infra_node = self.db.query(InfraNode).filter(
            InfraNode.cluster_id == self.cluster.id,
            InfraNode.hostname == node.metadata.name,
        ).first()

        node_interface = self._resolve_interface(node, infra_node)
        hops.append(
            self._build_hop(
                entity_type="node",
                entity_id=node.metadata.uid,
                name=node.metadata.name,
                interface=node_interface,
                latency_ms=self._safe_latency_ms(None, node),
                error_count=self._safe_error_count(None, node),
            )
        )

        # 9. Switch (ToR)
        switch_name = infra_node.switch_name if infra_node and infra_node.switch_name else "unknown-switch"
        hops.append(
            self._build_hop(
                entity_type="switch",
                entity_id=switch_name,
                name=switch_name,
                interface=node_interface,
            )
        )

        return hops


def map_k8s_or_trace_error(e: Exception) -> tuple[int, str]:
    if isinstance(e, ValueError):
        return 400, str(e)

    if isinstance(e, ApiException):
        if e.status == 404:
            return 404, "Kubernetes 리소스를 찾지 못했습니다"
        if e.status in (401, 403):
            return e.status, "Kubernetes API 권한이 부족합니다"
        return 502, e.reason or "Kubernetes API 호출에 실패했습니다"

    return 500, str(e) or "Topology trace 계산에 실패했습니다"
