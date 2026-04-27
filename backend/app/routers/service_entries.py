"""주요 서비스(k8s/keycloak/nexus/jenkins/argocd 등) 별 히스토리·지식·트러블슈팅 hub.

엔드포인트:
 - GET  /services/catalog                                   — 서비스별 항목 수 / 마지막 갱신
 - GET  /services/{service}/entries?cluster_id=&kind=&search=&tag= — 목록 조회
 - GET  /service-entries/{id}                              — 단건 (공유 URL 용)
 - POST /service-entries                                   — 신규
 - PUT  /service-entries/{id}                              — 수정
 - DEL  /service-entries/{id}                              — 삭제
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster, ServiceEntry
from app.schemas.service_entry import (
    ServiceCatalogItem,
    ServiceCatalogResponse,
    ServiceEntryCreate,
    ServiceEntryList,
    ServiceEntryOut,
    ServiceEntryUpdate,
)

router = APIRouter(tags=["service-entries"])


def _to_out(e: ServiceEntry) -> ServiceEntryOut:
    out = ServiceEntryOut.model_validate(e)
    if e.cluster is not None:
        out.cluster_name = e.cluster.name
    return out


# ── Catalog ──────────────────────────────────────────────────────────

@router.get("/services/catalog", response_model=ServiceCatalogResponse)
def get_catalog(
    cluster_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
):
    """서비스 키 별로 entry 수 / kind 별 분포 / 가장 최근 업데이트."""
    q = db.query(ServiceEntry)
    if cluster_id is not None:
        q = q.filter(
            (ServiceEntry.cluster_id == cluster_id) | (ServiceEntry.cluster_id.is_(None))
        )

    rows = q.all()
    by_service: dict[str, list[ServiceEntry]] = {}
    for r in rows:
        by_service.setdefault(r.service, []).append(r)

    items: list[ServiceCatalogItem] = []
    for svc, entries in by_service.items():
        by_kind: dict[str, int] = {}
        last = None
        for e in entries:
            by_kind[e.kind] = by_kind.get(e.kind, 0) + 1
            if last is None or (e.updated_at and e.updated_at > last):
                last = e.updated_at
        items.append(ServiceCatalogItem(
            service=svc, total=len(entries), by_kind=by_kind, last_updated=last,
        ))
    items.sort(key=lambda x: (-x.total, x.service))
    return ServiceCatalogResponse(services=items)


# ── List per service ─────────────────────────────────────────────────

@router.get("/services/{service}/entries", response_model=ServiceEntryList)
def list_entries(
    service: str,
    cluster_id: Optional[UUID] = Query(default=None,
        description="특정 클러스터 + 전역(NULL)만 보고 싶을 때. 미지정시 전체."),
    kind: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(ServiceEntry).filter(ServiceEntry.service == service)
    if cluster_id is not None:
        q = q.filter(
            (ServiceEntry.cluster_id == cluster_id) | (ServiceEntry.cluster_id.is_(None))
        )
    if kind:
        q = q.filter(ServiceEntry.kind == kind)
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(
            func.lower(ServiceEntry.title).like(like) | func.lower(ServiceEntry.content).like(like)
        )
    if tag:
        # JSONB 배열 contains
        q = q.filter(ServiceEntry.tags.op("@>")([tag]))

    # pinned 우선, 그 다음 updated_at desc
    rows = q.order_by(ServiceEntry.pinned.desc(), ServiceEntry.updated_at.desc()).all()
    return ServiceEntryList(data=[_to_out(r) for r in rows], total=len(rows))


# ── CRUD ────────────────────────────────────────────────────────────

@router.get("/service-entries/{entry_id}", response_model=ServiceEntryOut)
def get_entry(entry_id: UUID, db: Session = Depends(get_db)):
    e = db.query(ServiceEntry).filter(ServiceEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="ServiceEntry not found")
    return _to_out(e)


@router.post("/service-entries", response_model=ServiceEntryOut,
             status_code=status.HTTP_201_CREATED)
def create_entry(payload: ServiceEntryCreate, db: Session = Depends(get_db)):
    if payload.cluster_id is not None:
        if not db.query(Cluster).filter(Cluster.id == payload.cluster_id).first():
            raise HTTPException(status_code=422, detail="Cluster not found")
    e = ServiceEntry(**payload.model_dump(exclude_none=True))
    db.add(e)
    db.commit()
    db.refresh(e)
    return _to_out(e)


@router.put("/service-entries/{entry_id}", response_model=ServiceEntryOut)
def update_entry(entry_id: UUID, payload: ServiceEntryUpdate, db: Session = Depends(get_db)):
    e = db.query(ServiceEntry).filter(ServiceEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="ServiceEntry not found")
    data = payload.model_dump(exclude_unset=True)
    if "cluster_id" in data and data["cluster_id"] is not None:
        if not db.query(Cluster).filter(Cluster.id == data["cluster_id"]).first():
            raise HTTPException(status_code=422, detail="Cluster not found")
    for k, v in data.items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return _to_out(e)


@router.delete("/service-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: UUID, db: Session = Depends(get_db)):
    e = db.query(ServiceEntry).filter(ServiceEntry.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="ServiceEntry not found")
    db.delete(e)
    db.commit()
