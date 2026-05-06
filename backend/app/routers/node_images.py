from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from kubernetes.client.rest import ApiException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cluster import Cluster
from app.schemas.node_image import NodeImagesListResponse
from app.services.k8s_node_image_service import NodeImageService, map_k8s_error

router = APIRouter(prefix="/clusters/{cluster_id}/node-images", tags=["node-images"])


@router.get("", response_model=NodeImagesListResponse)
def get_node_images(cluster_id: UUID, db: Session = Depends(get_db)):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    try:
        service = NodeImageService(cluster)
        nodes = service.list_node_images()
        return NodeImagesListResponse(data=nodes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except ApiException as e:
        status_code, detail = map_k8s_error(e)
        raise HTTPException(status_code=status_code, detail=detail)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
