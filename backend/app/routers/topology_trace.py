from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cluster import Cluster
from app.schemas.topology_trace import (
    PacketFlowRequest,
    PacketFlowResponse,
    TopologyTraceRequest,
    TopologyTraceResponse,
)
from app.services.topology_trace_service import (
    PacketFlowRequest as PacketFlowReqDC,
    TopologyTraceService,
    TraceTarget,
    map_k8s_or_trace_error,
)

router = APIRouter(prefix="/topology-trace", tags=["topology-trace"])


@router.post("", response_model=TopologyTraceResponse)
def topology_trace(payload: TopologyTraceRequest, db: Session = Depends(get_db)):
    cluster = db.query(Cluster).filter(Cluster.id == UUID(str(payload.cluster_id))).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    service = TopologyTraceService(db=db, cluster=cluster)
    try:
        hops = service.trace(
            namespace=payload.namespace,
            target=TraceTarget(target_type=payload.target_type, target_name=payload.target_name),
        )
    except Exception as e:
        status_code, detail = map_k8s_or_trace_error(e)
        raise HTTPException(status_code=status_code, detail=detail) from e

    return TopologyTraceResponse(
        cluster_id=payload.cluster_id,
        namespace=payload.namespace,
        target_type=payload.target_type,
        target_name=payload.target_name,
        hops=hops,
    )


@router.post("/packet-flow", response_model=PacketFlowResponse)
def packet_flow(payload: PacketFlowRequest, db: Session = Depends(get_db)):
    """외부 client 요청에서 내부 pod까지의 E2E 패킷 경로를 추적합니다."""
    cluster = db.query(Cluster).filter(Cluster.id == UUID(str(payload.cluster_id))).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    service = TopologyTraceService(db=db, cluster=cluster)
    try:
        hops = service.trace_packet_flow(
            PacketFlowReqDC(host=payload.host, path=payload.path, protocol=payload.protocol),
        )
    except Exception as e:
        status_code, detail = map_k8s_or_trace_error(e)
        raise HTTPException(status_code=status_code, detail=detail) from e

    return PacketFlowResponse(
        cluster_id=payload.cluster_id,
        host=payload.host,
        path=payload.path,
        protocol=payload.protocol,
        hops=hops,
    )
