from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from kubernetes.client.rest import ApiException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cluster import Cluster
from app.schemas.node_label import NodeListResponse, NodeLabelPatchRequest, NodeLabelPatchResponse
from app.services.k8s_node_label_service import NodeLabelService, map_k8s_error

router = APIRouter(prefix="/clusters/{cluster_id}/nodes", tags=["node-labels"])


@router.get("", response_model=NodeListResponse)
def get_nodes(cluster_id: UUID, db: Session = Depends(get_db)):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        service = NodeLabelService(cluster)
        nodes = service.list_nodes()
        return NodeListResponse(data=nodes)
    except ApiException as e:
        status_code, detail = map_k8s_error(e)
        raise HTTPException(status_code=status_code, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{node_name}/labels", response_model=NodeLabelPatchResponse)
def patch_node_labels(
    cluster_id: UUID,
    node_name: str,
    payload: NodeLabelPatchRequest,
    db: Session = Depends(get_db),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        service = NodeLabelService(cluster)
        updated = service.patch_labels(node_name=node_name, add=payload.add, remove=payload.remove)
        return NodeLabelPatchResponse(message="Node labels updated", data=updated)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ApiException as e:
        status_code, detail = map_k8s_error(e)
        raise HTTPException(status_code=status_code, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
