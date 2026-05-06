import os

from kubernetes import client, config
from kubernetes.client.rest import ApiException

from app.models.cluster import Cluster


class NodeImageService:
    """Lists container images cached on each node via the Kubernetes API.

    Equivalent to inspecting `kubectl get nodes -o json` → `.status.images[]`.
    No SSH / crictl access to the node is required.
    """

    def __init__(self, cluster: Cluster):
        self.cluster = cluster
        self._v1: client.CoreV1Api | None = None

    def _get_client(self) -> client.CoreV1Api:
        if self._v1 is not None:
            return self._v1

        kubeconfig = self.cluster.kubeconfig_path
        if kubeconfig and os.path.exists(kubeconfig):
            config.load_kube_config(config_file=kubeconfig)
        else:
            try:
                config.load_incluster_config()
            except config.ConfigException:
                if kubeconfig:
                    detail = f"kubeconfig 파일을 찾을 수 없습니다: '{kubeconfig}'"
                else:
                    detail = f"클러스터 '{self.cluster.name}'에 kubeconfig_path가 설정되지 않았습니다"
                raise ValueError(
                    f"{detail}. in-cluster 환경도 아닙니다. "
                    "클러스터 설정에서 kubeconfig를 등록하세요."
                )

        self._v1 = client.CoreV1Api()
        return self._v1

    @staticmethod
    def _role_from_labels(labels: dict[str, str]) -> str:
        if "node-role.kubernetes.io/control-plane" in labels or "node-role.kubernetes.io/master" in labels:
            return "control-plane"
        for key in labels.keys():
            if key.startswith("node-role.kubernetes.io/"):
                return key.split("/", 1)[1] or "worker"
        return "worker"

    @staticmethod
    def _status_from_node(node: client.V1Node) -> str:
        for cond in node.status.conditions or []:
            if cond.type == "Ready":
                return "ready" if cond.status == "True" else "not-ready"
        return "unknown"

    def list_node_images(self) -> list[dict]:
        v1 = self._get_client()
        nodes = v1.list_node().items
        out: list[dict] = []
        for node in nodes:
            labels = node.metadata.labels or {}
            images = []
            total = 0
            for img in node.status.images or []:
                size = int(img.size_bytes or 0)
                names = list(img.names or [])
                images.append({"names": names, "size_bytes": size})
                total += size
            images.sort(key=lambda x: x["size_bytes"], reverse=True)
            out.append(
                {
                    "node": node.metadata.name,
                    "role": self._role_from_labels(labels),
                    "status": self._status_from_node(node),
                    "image_count": len(images),
                    "total_size_bytes": total,
                    "images": images,
                }
            )
        return out


def map_k8s_error(e: ApiException) -> tuple[int, str]:
    if e.status in (403, 409, 422):
        return e.status, e.reason or "Kubernetes API error"
    if e.status == 404:
        return 404, "Node not found"
    return 500, e.reason or "Failed to call Kubernetes API"
