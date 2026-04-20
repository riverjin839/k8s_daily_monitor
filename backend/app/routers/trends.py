from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.trends.trend_service import TrendService

router = APIRouter(prefix="/trends", tags=["trends"])


# ── Response Schemas ────────────────────────────────────────────

class TrendSourceOut(BaseModel):
    id: UUID
    name: str
    source_type: str
    url: str
    category: str
    enabled: bool

    class Config:
        from_attributes = True


class TrendItemOut(BaseModel):
    id: UUID
    title: str
    url: str
    published_at: str
    summary_ko: Optional[str] = None
    version: Optional[str] = None
    item_type: str
    source_name: str
    category: str

    class Config:
        from_attributes = True


class TrendDigestOut(BaseModel):
    id: UUID
    digest_date: date
    overall_summary_ko: Optional[str] = None
    item_count: int
    status: str
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class ToggleSourceRequest(BaseModel):
    enabled: bool


# ── Endpoints ───────────────────────────────────────────────────

@router.post("/collect", response_model=TrendDigestOut)
async def trigger_collect(
    target_date: Optional[date] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
):
    """트렌드 수집 수동 트리거 (백그라운드 실행)"""
    svc = TrendService(db)
    digest = await svc.run_daily_collect(target_date)
    return _digest_out(digest)


@router.get("/digests", response_model=list[TrendDigestOut])
def list_digests(limit: int = 30, db: Session = Depends(get_db)):
    svc = TrendService(db)
    return [_digest_out(d) for d in svc.list_digests(limit)]


@router.get("/digests/{target_date}", response_model=TrendDigestOut)
def get_digest(target_date: date, db: Session = Depends(get_db)):
    svc = TrendService(db)
    d = svc.get_digest(target_date)
    if not d:
        raise HTTPException(status_code=404, detail="해당 날짜의 다이제스트가 없습니다")
    return _digest_out(d)


@router.get("/items/{target_date}", response_model=list[TrendItemOut])
def list_items(
    target_date: date,
    category: Optional[str] = None,
    item_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    svc = TrendService(db)
    items = svc.list_items(target_date, category, item_type)
    return [_item_out(i) for i in items]


@router.get("/sources", response_model=list[TrendSourceOut])
def list_sources(db: Session = Depends(get_db)):
    svc = TrendService(db)
    return svc.list_sources()


@router.patch("/sources/{source_id}", response_model=TrendSourceOut)
def toggle_source(source_id: UUID, body: ToggleSourceRequest, db: Session = Depends(get_db)):
    svc = TrendService(db)
    src = svc.toggle_source(str(source_id), body.enabled)
    if not src:
        raise HTTPException(status_code=404, detail="소스를 찾을 수 없습니다")
    return src


# ── helpers ─────────────────────────────────────────────────────

def _digest_out(d) -> dict:
    return {
        "id": d.id,
        "digest_date": d.digest_date,
        "overall_summary_ko": d.overall_summary_ko,
        "item_count": d.item_count,
        "status": d.status,
        "error_message": d.error_message,
    }


def _item_out(i) -> dict:
    return {
        "id": i.id,
        "title": i.title,
        "url": i.url,
        "published_at": i.published_at.isoformat(),
        "summary_ko": i.summary_ko,
        "version": i.version,
        "item_type": i.item_type,
        "source_name": i.source.name if i.source else "",
        "category": i.source.category if i.source else "",
    }
