import os
from dataclasses import dataclass

from kubernetes import client, config
from kubernetes.client.rest import ApiException
from sqlalchemy.orm import Session

from app.models.cluster import Cluster
from app.models.infra_node import InfraNode


@dataclass
class TraceTarget:
    target_type: str
    target_name: str


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
