import json
import subprocess
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cluster import Cluster
from app.models.infra_node import InfraNode
from app.schemas.infra_node import (
    InfraNodeCreate,
    InfraNodeUpdate,
    InfraNodeResponse,
    InfraNodeListResponse,
    SyncResult,
)

router = APIRouter(prefix="/infra-nodes", tags=["infra-nodes"])

_KUBECTL_TIMEOUT = 30


@router.get("", response_model=InfraNodeListResponse)
def list_infra_nodes(
    cluster_id: UUID | None = None,
    rack_name: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(InfraNode)
    if cluster_id:
        q = q.filter(InfraNode.cluster_id == cluster_id)
    if rack_name:
        q = q.filter(InfraNode.rack_name == rack_name)
    nodes = q.order_by(InfraNode.rack_name, InfraNode.hostname).all()
    return InfraNodeListResponse(data=nodes, total=len(nodes))


@router.get("/{node_id}", response_model=InfraNodeResponse)
def get_infra_node(node_id: UUID, db: Session = Depends(get_db)):
    node = db.query(InfraNode).filter(InfraNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="InfraNode not found")
    return node


@router.post("", response_model=InfraNodeResponse, status_code=status.HTTP_201_CREATED)
def create_infra_node(payload: InfraNodeCreate, db: Session = Depends(get_db)):
    cluster = db.query(Cluster).filter(Cluster.id == payload.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    node = InfraNode(**payload.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.put("/{node_id}", response_model=InfraNodeResponse)
def update_infra_node(node_id: UUID, payload: InfraNodeUpdate, db: Session = Depends(get_db)):
    node = db.query(InfraNode).filter(InfraNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="InfraNode not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(node, k, v)
    db.commit()
    db.refresh(node)
    return node


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_infra_node(node_id: UUID, db: Session = Depends(get_db)):
    node = db.query(InfraNode).filter(InfraNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="InfraNode not found")
    db.delete(node)
    db.commit()
    return None


@router.post("/sync/{cluster_id}", response_model=SyncResult)
def sync_infra_nodes_from_k8s(cluster_id: UUID, db: Session = Depends(get_db)):
    """kubectl get nodes 를 통해 클러스터 노드 정보를 자동 수집하고 upsert"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # Build kubectl command
    cmd = ["kubectl", "get", "nodes", "-o", "json"]
    if cluster.kubeconfig_path:
        cmd = ["kubectl", "--kubeconfig", cluster.kubeconfig_path] + cmd[1:]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_KUBECTL_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="kubectl timed out")
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="kubectl not found")

    if result.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"kubectl error: {result.stderr[:200]}",
        )

    try:
        k8s_data = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Invalid kubectl output")

    created_count = 0
    updated_count = 0

    for item in k8s_data.get("items", []):
        # Extract hostname
        hostname = item.get("metadata", {}).get("name", "")
        if not hostname:
            continue

        # Determine role from labels
        labels = item.get("metadata", {}).get("labels", {})
        if "node-role.kubernetes.io/master" in labels or "node-role.kubernetes.io/control-plane" in labels:
            role = "master"
        else:
            role = "worker"

        # Extract capacity (CPU, Memory)
        capacity = item.get("status", {}).get("capacity", {})
        cpu_str = capacity.get("cpu", "")
        mem_str = capacity.get("memory", "")  # e.g. "16Gi" or "16384Ki"

        cpu_cores = None
        if cpu_str:
            try:
                cpu_cores = int(cpu_str)
            except ValueError:
                pass

        ram_gb = None
        if mem_str:
            try:
                if mem_str.endswith("Ki"):
                    ram_gb = round(int(mem_str[:-2]) / (1024 * 1024))
                elif mem_str.endswith("Mi"):
                    ram_gb = round(int(mem_str[:-2]) / 1024)
                elif mem_str.endswith("Gi"):
                    ram_gb = int(mem_str[:-2])
                else:
                    ram_gb = round(int(mem_str) / (1024 * 1024 * 1024))
            except ValueError:
                pass

        # Extract internal IP
        ip_address = None
        for addr in item.get("status", {}).get("addresses", []):
            if addr.get("type") == "InternalIP":
                ip_address = addr.get("address")
                break

        # OS info
        node_info = item.get("status", {}).get("nodeInfo", {})
        os_info = node_info.get("osImage", None)

        # Upsert by hostname
        existing = db.query(InfraNode).filter(
            InfraNode.cluster_id == cluster_id,
            InfraNode.hostname == hostname,
        ).first()

        if existing:
            existing.role = role
            if cpu_cores is not None:
                existing.cpu_cores = cpu_cores
            if ram_gb is not None:
                existing.ram_gb = ram_gb
            if ip_address:
                existing.ip_address = ip_address
            if os_info:
                existing.os_info = os_info
            existing.auto_synced = True
            updated_count += 1
        else:
            new_node = InfraNode(
                cluster_id=cluster_id,
                hostname=hostname,
                role=role,
                cpu_cores=cpu_cores,
                ram_gb=ram_gb,
                ip_address=ip_address,
                os_info=os_info,
                auto_synced=True,
            )
            db.add(new_node)
            created_count += 1

    db.commit()
    return SyncResult(created=created_count, updated=updated_count, total=created_count + updated_count)
