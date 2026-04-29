"""Ansible Playbook 파일 / Inventory 관리 라우터.

`/api/v1/playbook-files`     — 클러스터 무관 공용 Playbook YAML 라이브러리
`/api/v1/playbook-inventories` — 클러스터별 Inventory (한 클러스터에 여러 개)
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AnsibleInventory, AnsiblePlaybookFile, Cluster
from app.schemas.ansible_assets import (
    AnsibleInventoryCreate,
    AnsibleInventoryResponse,
    AnsibleInventoryUpdate,
    AnsiblePlaybookFileCreate,
    AnsiblePlaybookFileResponse,
    AnsiblePlaybookFileUpdate,
)

# ── Playbook Files (공용) ────────────────────────────────────────────────

files_router = APIRouter(prefix="/playbook-files", tags=["ansible-assets"])


@files_router.get("", response_model=list[AnsiblePlaybookFileResponse])
def list_playbook_files(db: Session = Depends(get_db)):
    return db.query(AnsiblePlaybookFile).order_by(AnsiblePlaybookFile.name).all()


@files_router.post("", response_model=AnsiblePlaybookFileResponse, status_code=status.HTTP_201_CREATED)
def create_playbook_file(payload: AnsiblePlaybookFileCreate, db: Session = Depends(get_db)):
    pf = AnsiblePlaybookFile(**payload.model_dump())
    db.add(pf)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Playbook file '{payload.name}' already exists",
        )
    db.refresh(pf)
    return pf


@files_router.get("/{file_id}", response_model=AnsiblePlaybookFileResponse)
def get_playbook_file(file_id: UUID, db: Session = Depends(get_db)):
    pf = db.query(AnsiblePlaybookFile).filter(AnsiblePlaybookFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Playbook file not found")
    return pf


@files_router.put("/{file_id}", response_model=AnsiblePlaybookFileResponse)
def update_playbook_file(
    file_id: UUID, payload: AnsiblePlaybookFileUpdate, db: Session = Depends(get_db),
):
    pf = db.query(AnsiblePlaybookFile).filter(AnsiblePlaybookFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Playbook file not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(pf, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Name conflict")
    db.refresh(pf)
    return pf


@files_router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playbook_file(file_id: UUID, db: Session = Depends(get_db)):
    pf = db.query(AnsiblePlaybookFile).filter(AnsiblePlaybookFile.id == file_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="Playbook file not found")
    db.delete(pf)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이 파일을 참조하는 Playbook 이 있어 삭제할 수 없습니다.",
        )
    return None


# ── Inventories (per-cluster, multiple) ─────────────────────────────────

inv_router = APIRouter(prefix="/playbook-inventories", tags=["ansible-assets"])


def _require_cluster(cluster_id: UUID, db: Session) -> Cluster:
    c = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return c


@inv_router.get("", response_model=list[AnsibleInventoryResponse])
def list_inventories(
    cluster_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(AnsibleInventory)
    if cluster_id:
        q = q.filter(AnsibleInventory.cluster_id == cluster_id)
    return q.order_by(
        AnsibleInventory.cluster_id, AnsibleInventory.is_default.desc(), AnsibleInventory.name,
    ).all()


@inv_router.post("", response_model=AnsibleInventoryResponse, status_code=status.HTTP_201_CREATED)
def create_inventory(payload: AnsibleInventoryCreate, db: Session = Depends(get_db)):
    _require_cluster(payload.cluster_id, db)
    inv = AnsibleInventory(**payload.model_dump())
    db.add(inv)
    if payload.is_default:
        # 같은 클러스터에 다른 default 가 있다면 모두 false 로 내려둔다.
        db.query(AnsibleInventory).filter(
            AnsibleInventory.cluster_id == payload.cluster_id,
            AnsibleInventory.is_default.is_(True),
        ).update({"is_default": False})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Inventory '{payload.name}' already exists for this cluster",
        )
    db.refresh(inv)
    return inv


@inv_router.get("/{inv_id}", response_model=AnsibleInventoryResponse)
def get_inventory(inv_id: UUID, db: Session = Depends(get_db)):
    inv = db.query(AnsibleInventory).filter(AnsibleInventory.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    return inv


@inv_router.put("/{inv_id}", response_model=AnsibleInventoryResponse)
def update_inventory(
    inv_id: UUID, payload: AnsibleInventoryUpdate, db: Session = Depends(get_db),
):
    inv = db.query(AnsibleInventory).filter(AnsibleInventory.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    if payload.is_default is True:
        db.query(AnsibleInventory).filter(
            AnsibleInventory.cluster_id == inv.cluster_id,
            AnsibleInventory.id != inv_id,
            AnsibleInventory.is_default.is_(True),
        ).update({"is_default": False})
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(inv, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Name conflict for this cluster")
    db.refresh(inv)
    return inv


@inv_router.delete("/{inv_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory(inv_id: UUID, db: Session = Depends(get_db)):
    inv = db.query(AnsibleInventory).filter(AnsibleInventory.id == inv_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    db.delete(inv)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이 Inventory 를 참조하는 Playbook 이 있어 삭제할 수 없습니다.",
        )
    return None
