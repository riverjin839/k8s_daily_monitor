"""Notification 채널 CRUD + 테스트 발송 + 발송 이력."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    NotificationChannel,
    NotificationChannelType,
    NotificationLog,
)
from app.services.notifier import send_via_channel

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class ChannelIn(BaseModel):
    name: str
    channel_type: NotificationChannelType
    enabled: bool = True
    cluster_id: Optional[UUID] = None
    min_severity: str = "warning"
    config: Optional[dict[str, Any]] = None


class ChannelOut(BaseModel):
    id: UUID
    name: str
    channel_type: NotificationChannelType
    enabled: bool
    cluster_id: Optional[UUID] = None
    min_severity: str
    config: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationLogOut(BaseModel):
    id: UUID
    channel_id: Optional[UUID] = None
    daily_check_log_id: Optional[UUID] = None
    status: str
    subject: Optional[str] = None
    body: Optional[str] = None
    error: Optional[str] = None
    sent_at: datetime

    class Config:
        from_attributes = True


@router.get("/channels", response_model=list[ChannelOut])
def list_channels(db: Session = Depends(get_db)):
    return db.query(NotificationChannel).order_by(NotificationChannel.created_at.desc()).all()


@router.post("/channels", response_model=ChannelOut)
def create_channel(body: ChannelIn, db: Session = Depends(get_db)):
    row = NotificationChannel(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/channels/{cid}", response_model=ChannelOut)
def update_channel(cid: UUID, body: ChannelIn, db: Session = Depends(get_db)):
    row = db.query(NotificationChannel).filter(NotificationChannel.id == cid).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/channels/{cid}")
def delete_channel(cid: UUID, db: Session = Depends(get_db)):
    row = db.query(NotificationChannel).filter(NotificationChannel.id == cid).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.post("/test/{cid}", response_model=NotificationLogOut)
def test_channel(cid: UUID, db: Session = Depends(get_db)):
    row = db.query(NotificationChannel).filter(NotificationChannel.id == cid).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    log = send_via_channel(
        db,
        row,
        subject=f"[TEST] {row.name}",
        body=(
            "이것은 DEVOPS MANAGEMENT 일일 점검 알림 테스트입니다.\n"
            "수신 측에서 이 메시지를 확인했다면 채널 설정이 정상입니다."
        ),
    )
    return log


@router.get("/log", response_model=list[NotificationLogOut])
def list_log(limit: int = 50, db: Session = Depends(get_db)):
    return (
        db.query(NotificationLog)
        .order_by(desc(NotificationLog.sent_at))
        .limit(limit)
        .all()
    )
