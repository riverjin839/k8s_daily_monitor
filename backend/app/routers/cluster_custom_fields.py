"""ClusterCustomField CRUD + 클러스터별 custom_values 업데이트 엔드포인트."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster, ClusterCustomField
from app.schemas.cluster_custom_field import (
    ClusterCustomFieldCreate,
    ClusterCustomFieldList,
    ClusterCustomFieldOut,
    ClusterCustomFieldUpdate,
    ClusterCustomValuesUpdate,
)

router = APIRouter(tags=["cluster-custom-fields"])


@router.get("/cluster-custom-fields", response_model=ClusterCustomFieldList)
def list_fields(db: Session = Depends(get_db)):
    rows = (
        db.query(ClusterCustomField)
        .order_by(ClusterCustomField.sort_order, ClusterCustomField.label)
        .all()
    )
    return ClusterCustomFieldList(data=[ClusterCustomFieldOut.model_validate(r) for r in rows])


@router.post("/cluster-custom-fields", response_model=ClusterCustomFieldOut,
             status_code=status.HTTP_201_CREATED)
def create_field(payload: ClusterCustomFieldCreate, db: Session = Depends(get_db)):
    if db.query(ClusterCustomField).filter(ClusterCustomField.key == payload.key).first():
        raise HTTPException(status_code=409, detail=f"이미 존재하는 key: {payload.key}")

    data = payload.model_dump()
    # sort_order 자동 할당 — 0 이면 맨 뒤로
    if data.get("sort_order", 0) == 0:
        last = (
            db.query(ClusterCustomField)
            .order_by(ClusterCustomField.sort_order.desc())
            .first()
        )
        data["sort_order"] = (last.sort_order + 10) if last else 10

    field = ClusterCustomField(**data)
    db.add(field)
    db.commit()
    db.refresh(field)
    return ClusterCustomFieldOut.model_validate(field)


@router.put("/cluster-custom-fields/{field_id}", response_model=ClusterCustomFieldOut)
def update_field(field_id: UUID, payload: ClusterCustomFieldUpdate,
                 db: Session = Depends(get_db)):
    field = db.query(ClusterCustomField).filter(ClusterCustomField.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(field, k, v)
    db.commit()
    db.refresh(field)
    return ClusterCustomFieldOut.model_validate(field)


@router.delete("/cluster-custom-fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(field_id: UUID, db: Session = Depends(get_db)):
    field = db.query(ClusterCustomField).filter(ClusterCustomField.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    # 모든 클러스터의 custom_values 에서 해당 key 제거
    clusters = (
        db.query(Cluster)
        .filter(Cluster.custom_values.isnot(None))
        .all()
    )
    for c in clusters:
        if isinstance(c.custom_values, dict) and field.key in c.custom_values:
            new_vals = {k: v for k, v in c.custom_values.items() if k != field.key}
            c.custom_values = new_vals or None
    db.delete(field)
    db.commit()


# ── 특정 클러스터의 커스텀 값 업데이트 ────────────────────────────────────

@router.put("/clusters/{cluster_id}/custom-values", response_model=dict)
def update_cluster_custom_values(
    cluster_id: UUID,
    payload: ClusterCustomValuesUpdate,
    db: Session = Depends(get_db),
):
    """전달된 키들을 병합. null 값은 해당 키 삭제를 의미."""
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # 허용된 field key 만 저장 (정의되지 않은 key 는 거부)
    allowed = {f.key for f in db.query(ClusterCustomField).all()}
    current: dict = dict(cluster.custom_values or {})
    for k, v in payload.values.items():
        if k not in allowed:
            raise HTTPException(status_code=422, detail=f"정의되지 않은 커스텀 필드: {k}")
        if v is None:
            current.pop(k, None)
        else:
            current[k] = v
    cluster.custom_values = current or None
    db.commit()
    return {"cluster_id": str(cluster_id), "custom_values": current}
