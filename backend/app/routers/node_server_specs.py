"""NodeServerSpec CRUD + 클러스터에서 자동 임포트 엔드포인트.

대장(ledger) 관점 자산 관리 — 등록/수정/삭제 + 노드 정보를 k8s API 로 일괄
끌어와 신규/upsert 한다.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from kubernetes import client as k8s_client, config as k8s_config
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster, NodeServerSpec
from app.schemas.node_server_spec import (
    NodeServerSpecCreate,
    NodeServerSpecList,
    NodeServerSpecOut,
    NodeServerSpecUpdate,
    NodeSpecImportRequest,
    NodeSpecImportResult,
)
from app.services.kubeconfig import ensure_kubeconfig_file

router = APIRouter(prefix="/node-specs", tags=["node-specs"])

_K8S_TIMEOUT = 10


# ── 헬퍼 ──────────────────────────────────────────────────────────────────────

def _to_out(spec: NodeServerSpec) -> NodeServerSpecOut:
    out = NodeServerSpecOut.model_validate(spec)
    if spec.cluster is not None:
        out.cluster_name = spec.cluster.name
    return out


# ── List / Get ────────────────────────────────────────────────────────────────

@router.get("", response_model=NodeServerSpecList)
def list_specs(
    cluster_id: Optional[UUID] = Query(default=None),
    status: Optional[str] = Query(default=None, description="active / spare / maintenance / decommission"),
    role: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, description="hostname / serial / asset_tag / IP 부분일치"),
    db: Session = Depends(get_db),
):
    q = db.query(NodeServerSpec)
    if cluster_id is not None:
        q = q.filter(NodeServerSpec.cluster_id == cluster_id)
    if status:
        q = q.filter(NodeServerSpec.status == status)
    if role:
        q = q.filter(NodeServerSpec.role == role)
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(
            (NodeServerSpec.hostname.ilike(like))
            | (NodeServerSpec.serial_number.ilike(like))
            | (NodeServerSpec.asset_tag.ilike(like))
            | (NodeServerSpec.internal_ip.ilike(like))
            | (NodeServerSpec.bmc_ip.ilike(like))
            | (NodeServerSpec.vendor.ilike(like))
            | (NodeServerSpec.model.ilike(like))
        )
    rows = q.order_by(NodeServerSpec.cluster_id.nulls_last(), NodeServerSpec.hostname).all()
    return NodeServerSpecList(data=[_to_out(r) for r in rows], total=len(rows))


@router.get("/{spec_id}", response_model=NodeServerSpecOut)
def get_spec(spec_id: UUID, db: Session = Depends(get_db)):
    spec = db.query(NodeServerSpec).filter(NodeServerSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="NodeServerSpec not found")
    return _to_out(spec)


# ── Create / Update / Delete ─────────────────────────────────────────────────

@router.post("", response_model=NodeServerSpecOut, status_code=status.HTTP_201_CREATED)
def create_spec(payload: NodeServerSpecCreate, db: Session = Depends(get_db)):
    if payload.cluster_id is not None:
        if not db.query(Cluster).filter(Cluster.id == payload.cluster_id).first():
            raise HTTPException(status_code=422, detail="Cluster not found")

    # unique (cluster_id, hostname) 검증
    existing = (
        db.query(NodeServerSpec)
        .filter(
            NodeServerSpec.cluster_id == payload.cluster_id,
            NodeServerSpec.hostname == payload.hostname,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"이미 존재하는 호스트: {payload.hostname} (cluster={payload.cluster_id})",
        )

    spec = NodeServerSpec(**payload.model_dump(exclude_none=True))
    db.add(spec)
    db.commit()
    db.refresh(spec)
    return _to_out(spec)


@router.put("/{spec_id}", response_model=NodeServerSpecOut)
def update_spec(spec_id: UUID, payload: NodeServerSpecUpdate, db: Session = Depends(get_db)):
    spec = db.query(NodeServerSpec).filter(NodeServerSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="NodeServerSpec not found")
    data = payload.model_dump(exclude_unset=True)
    if "cluster_id" in data and data["cluster_id"] is not None:
        if not db.query(Cluster).filter(Cluster.id == data["cluster_id"]).first():
            raise HTTPException(status_code=422, detail="Cluster not found")
    for k, v in data.items():
        setattr(spec, k, v)
    db.commit()
    db.refresh(spec)
    return _to_out(spec)


@router.delete("/{spec_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_spec(spec_id: UUID, db: Session = Depends(get_db)):
    spec = db.query(NodeServerSpec).filter(NodeServerSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(status_code=404, detail="NodeServerSpec not found")
    db.delete(spec)
    db.commit()


# ── 클러스터 자동 임포트 ────────────────────────────────────────────────────

# 자동 수집 가능한 필드 (k8s API 만으로) — 이 키들은 import 시 항상 새 값으로 갱신.
_AUTOSYNC_FIELDS = {
    "node_name", "internal_ip", "external_ip",
    "cpu_cores", "cpu_threads", "memory_gb",
    "os_image", "kernel_version", "kubelet_version", "container_runtime",
    "role",
}


def _gi_to_gb(qty: str) -> Optional[int]:
    """k8s 자원 quantity → GB (정수). '64Gi' / '65536Mi' / '67108864Ki'."""
    if not qty:
        return None
    qty = qty.strip()
    try:
        if qty.endswith("Gi"):
            return int(float(qty[:-2]))
        if qty.endswith("Mi"):
            return int(float(qty[:-2]) / 1024)
        if qty.endswith("Ki"):
            return int(float(qty[:-2]) / 1024 / 1024)
        if qty.endswith("G"):
            return int(float(qty[:-1]) * 0.931)  # 1G = 0.931 GiB
        if qty.endswith("M"):
            return int(float(qty[:-1]) / 1024 * 0.931)
        return int(float(qty) / 1024 / 1024 / 1024)
    except (ValueError, IndexError):
        return None


def _node_role(labels: dict) -> Optional[str]:
    if any(k in labels for k in ("node-role.kubernetes.io/control-plane", "node-role.kubernetes.io/master")):
        return "control-plane"
    for k in labels:
        if k.startswith("node-role.kubernetes.io/"):
            r = k.split("/", 1)[1]
            if r:
                return r
    return "worker"


@router.post("/import/{cluster_id}", response_model=NodeSpecImportResult)
def import_from_cluster(
    cluster_id: UUID,
    payload: NodeSpecImportRequest = NodeSpecImportRequest(),
    db: Session = Depends(get_db),
):
    """k8s API 로 노드 메타데이터를 끌어와 NodeServerSpec 에 upsert.

    수집 필드: hostname, node_name, internal_ip, external_ip, role, cpu_cores,
    cpu_threads (k8s 노드는 logical CPU 개수만 노출), memory_gb, os_image,
    kernel_version, kubelet_version, container_runtime.
    벤더/모델/시리얼/랙위치/자산태그 등은 덮어쓰지 않음 (overwrite_user_fields=True 시는 예외).
    """
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    kc_path = ensure_kubeconfig_file(cluster)
    if not kc_path:
        raise HTTPException(status_code=422, detail="kubeconfig 가 등록돼 있지 않습니다.")

    try:
        api_client = k8s_config.new_client_from_config(config_file=kc_path)
        v1 = k8s_client.CoreV1Api(api_client)
        nodes = v1.list_node(_request_timeout=_K8S_TIMEOUT)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"k8s 노드 조회 실패: {str(e)[:200]}")

    inserted = 0
    updated_n = 0
    skipped = 0
    errors: list[str] = []
    out_items: list[NodeServerSpec] = []

    for n in nodes.items:
        try:
            host = n.metadata.name
            labels = n.metadata.labels or {}
            ni = n.status.node_info
            cap = (n.status.capacity or {}) if n.status else {}
            alloc = (n.status.allocatable or {}) if n.status else {}

            internal_ip = None
            external_ip = None
            for addr in (n.status.addresses or []) if n.status else []:
                if addr.type == "InternalIP" and not internal_ip:
                    internal_ip = addr.address
                elif addr.type == "ExternalIP" and not external_ip:
                    external_ip = addr.address

            cpu_threads = None
            try:
                cpu_threads = int(cap.get("cpu") or alloc.get("cpu") or 0) or None
            except (ValueError, TypeError):
                cpu_threads = None
            memory_gb = _gi_to_gb(cap.get("memory") or alloc.get("memory") or "")

            collected = {
                "node_name": host,
                "internal_ip": internal_ip,
                "external_ip": external_ip,
                "role": _node_role(labels),
                "cpu_cores": cpu_threads,    # k8s 는 thread 단위. 사용자가 sockets/cores 별도 입력 가능.
                "cpu_threads": cpu_threads,
                "memory_gb": memory_gb,
                "os_image": getattr(ni, "os_image", None),
                "kernel_version": getattr(ni, "kernel_version", None),
                "kubelet_version": getattr(ni, "kubelet_version", None),
                "container_runtime": getattr(ni, "container_runtime_version", None),
            }
            collected = {k: v for k, v in collected.items() if v is not None and v != ""}

            existing = (
                db.query(NodeServerSpec)
                .filter(NodeServerSpec.cluster_id == cluster_id, NodeServerSpec.hostname == host)
                .first()
            )

            if existing is None:
                spec = NodeServerSpec(
                    cluster_id=cluster_id,
                    hostname=host,
                    status="active",
                    **collected,
                )
                db.add(spec)
                db.flush()
                out_items.append(spec)
                inserted += 1
            elif payload.upsert:
                changed = False
                for k, v in collected.items():
                    if payload.overwrite_user_fields or k in _AUTOSYNC_FIELDS:
                        if getattr(existing, k) != v:
                            setattr(existing, k, v)
                            changed = True
                if changed:
                    out_items.append(existing)
                    updated_n += 1
                else:
                    skipped += 1
            else:
                skipped += 1
        except Exception as e:
            errors.append(f"{n.metadata.name if n.metadata else '?'}: {str(e)[:160]}")

    if inserted or updated_n:
        db.commit()
        for s in out_items:
            db.refresh(s)

    return NodeSpecImportResult(
        inserted=inserted,
        updated=updated_n,
        skipped=skipped,
        errors=errors,
        items=[_to_out(s) for s in out_items],
    )
