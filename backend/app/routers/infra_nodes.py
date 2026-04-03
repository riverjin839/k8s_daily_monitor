import json
import subprocess
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cluster import Cluster
from app.models.infra_node import InfraNode
from app.models.infra_node_sync_history import InfraNodeSyncHistory
from app.schemas.infra_node import (
    InfraNodeCreate,
    InfraNodeUpdate,
    InfraNodeResponse,
    InfraNodeListResponse,
    SyncResult,
    TopologySyncRequest,
    InfraNodeSyncHistoryListResponse,
)
from app.services.topology_sync import collect_topology_candidates

router = APIRouter(prefix="/infra-nodes", tags=["infra-nodes"])

_KUBECTL_TIMEOUT = 30


def _record_history(
    db: Session,
    *,
    cluster_id: UUID,
    node_id: UUID | None,
    sync_type: str,
    source: str,
    action: str,
    confidence: int,
    priority: int,
    before_data: dict | None,
    after_data: dict | None,
    message: str | None = None,
    conflict_fields: list[str] | None = None,
):
    db.add(
        InfraNodeSyncHistory(
            cluster_id=cluster_id,
            node_id=node_id,
            sync_type=sync_type,
            source=source,
            action=action,
            confidence=confidence,
            priority=priority,
            message=message,
            before_data=before_data,
            after_data=after_data,
            conflict_fields=conflict_fields,
        )
    )


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


@router.post("/sync/{cluster_id}/node", response_model=SyncResult)
def node_sync(cluster_id: UUID, db: Session = Depends(get_db)):
    """K8s 노드 메타데이터(CPU/Memory/IP/Role) 동기화"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

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
        hostname = item.get("metadata", {}).get("name", "")
        if not hostname:
            continue

        labels = item.get("metadata", {}).get("labels", {})
        role = "master" if "node-role.kubernetes.io/master" in labels or "node-role.kubernetes.io/control-plane" in labels else "worker"

        capacity = item.get("status", {}).get("capacity", {})
        cpu_str = capacity.get("cpu", "")
        mem_str = capacity.get("memory", "")

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

        ip_address = None
        for addr in item.get("status", {}).get("addresses", []):
            if addr.get("type") == "InternalIP":
                ip_address = addr.get("address")
                break

        node_info = item.get("status", {}).get("nodeInfo", {})
        os_info = node_info.get("osImage", None)

        existing = db.query(InfraNode).filter(
            InfraNode.cluster_id == cluster_id,
            InfraNode.hostname == hostname,
        ).first()

        after_data = {
            "hostname": hostname,
            "role": role,
            "cpu_cores": cpu_cores,
            "ram_gb": ram_gb,
            "ip_address": ip_address,
            "os_info": os_info,
        }

        if existing:
            before_data = {
                "role": existing.role,
                "cpu_cores": existing.cpu_cores,
                "ram_gb": existing.ram_gb,
                "ip_address": existing.ip_address,
                "os_info": existing.os_info,
            }
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
            _record_history(
                db,
                cluster_id=cluster_id,
                node_id=existing.id,
                sync_type="node_sync",
                source="k8s",
                action="updated",
                confidence=100,
                priority=100,
                before_data=before_data,
                after_data=after_data,
                message="K8s node metadata synchronized",
            )
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
            db.flush()
            created_count += 1
            _record_history(
                db,
                cluster_id=cluster_id,
                node_id=new_node.id,
                sync_type="node_sync",
                source="k8s",
                action="created",
                confidence=100,
                priority=100,
                before_data=None,
                after_data=after_data,
                message="K8s node discovered",
            )

    db.commit()
    return SyncResult(created=created_count, updated=updated_count, total=created_count + updated_count)


@router.post("/sync/{cluster_id}/topology", response_model=SyncResult)
def topology_sync(cluster_id: UUID, payload: TopologySyncRequest, db: Session = Depends(get_db)):
    """LLDP/CDP, CMDB, 수동 업로드를 병합해 토폴로지 필드 동기화"""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    candidates = collect_topology_candidates([s.model_dump() for s in payload.sources])

    grouped: dict[str, list] = {}
    for candidate in candidates:
        grouped.setdefault(candidate.hostname, []).append(candidate)

    created_count = 0
    updated_count = 0
    deleted_count = 0
    conflict_count = 0

    seen_hostnames = set(grouped.keys())

    for hostname, entries in grouped.items():
        existing = db.query(InfraNode).filter(
            InfraNode.cluster_id == cluster_id,
            InfraNode.hostname == hostname,
        ).first()

        merged: dict[str, str] = {}
        chosen_by_field: dict[str, tuple[int, int, str]] = {}
        conflict_fields: list[str] = []

        for entry in entries:
            for field, value in entry.fields.items():
                if value is None or value == "":
                    continue
                score = (entry.confidence, entry.priority)
                if field not in chosen_by_field:
                    chosen_by_field[field] = (score[0], score[1], entry.source)
                    merged[field] = value
                    continue

                selected_confidence, selected_priority, selected_source = chosen_by_field[field]
                if value != merged[field]:
                    if score > (selected_confidence, selected_priority):
                        conflict_fields.append(field)
                        chosen_by_field[field] = (score[0], score[1], entry.source)
                        merged[field] = value
                    else:
                        conflict_fields.append(field)
                        _record_history(
                            db,
                            cluster_id=cluster_id,
                            node_id=existing.id if existing else None,
                            sync_type="topology_sync",
                            source=entry.source,
                            action="conflict",
                            confidence=entry.confidence,
                            priority=entry.priority,
                            before_data={field: merged[field]},
                            after_data={field: value},
                            message=f"Conflict ignored: {selected_source} wins",
                            conflict_fields=[field],
                        )
                        conflict_count += 1

        if existing:
            before_data = {
                "rack_name": existing.rack_name,
                "switch_name": existing.switch_name,
                "ip_address": existing.ip_address,
                "notes": existing.notes,
                "role": existing.role,
                "os_info": existing.os_info,
            }
            for field, value in merged.items():
                setattr(existing, field, value)
            updated_count += 1
            top_source = max(entries, key=lambda x: (x.confidence, x.priority))
            _record_history(
                db,
                cluster_id=cluster_id,
                node_id=existing.id,
                sync_type="topology_sync",
                source=top_source.source,
                action="updated",
                confidence=top_source.confidence,
                priority=top_source.priority,
                before_data=before_data,
                after_data=merged,
                message="Topology data merged from multi-source inputs",
                conflict_fields=list(set(conflict_fields)) or None,
            )
            if conflict_fields:
                conflict_count += 1
        else:
            top_source = max(entries, key=lambda x: (x.confidence, x.priority))
            new_node = InfraNode(
                cluster_id=cluster_id,
                hostname=hostname,
                role=merged.get("role", "worker"),
                rack_name=merged.get("rack_name"),
                switch_name=merged.get("switch_name"),
                ip_address=merged.get("ip_address"),
                notes=merged.get("notes"),
                os_info=merged.get("os_info"),
                auto_synced=True,
            )
            db.add(new_node)
            db.flush()
            created_count += 1
            _record_history(
                db,
                cluster_id=cluster_id,
                node_id=new_node.id,
                sync_type="topology_sync",
                source=top_source.source,
                action="created",
                confidence=top_source.confidence,
                priority=top_source.priority,
                before_data=None,
                after_data=merged,
                message="Topology node created from source plugins",
                conflict_fields=list(set(conflict_fields)) or None,
            )
            if conflict_fields:
                conflict_count += 1

    if payload.delete_missing:
        stale_nodes = db.query(InfraNode).filter(
            InfraNode.cluster_id == cluster_id,
            ~InfraNode.hostname.in_(seen_hostnames),
        ).all()
        for stale in stale_nodes:
            _record_history(
                db,
                cluster_id=cluster_id,
                node_id=stale.id,
                sync_type="topology_sync",
                source="merged",
                action="deleted",
                confidence=0,
                priority=0,
                before_data={"hostname": stale.hostname},
                after_data=None,
                message="Deleted by topology_sync delete_missing",
            )
            db.delete(stale)
            deleted_count += 1

    db.commit()
    return SyncResult(
        created=created_count,
        updated=updated_count,
        deleted=deleted_count,
        conflicts=conflict_count,
        total=created_count + updated_count + deleted_count,
    )


@router.post("/sync/{cluster_id}", response_model=SyncResult)
def sync_infra_nodes_from_k8s(cluster_id: UUID, db: Session = Depends(get_db)):
    """Legacy endpoint. maps to node_sync."""
    return node_sync(cluster_id=cluster_id, db=db)


@router.get("/sync/{cluster_id}/history", response_model=InfraNodeSyncHistoryListResponse)
def list_sync_histories(cluster_id: UUID, limit: int = 100, db: Session = Depends(get_db)):
    rows = (
        db.query(InfraNodeSyncHistory)
        .filter(InfraNodeSyncHistory.cluster_id == cluster_id)
        .order_by(InfraNodeSyncHistory.synced_at.desc())
        .limit(limit)
        .all()
    )
    return InfraNodeSyncHistoryListResponse(data=rows, total=len(rows))
