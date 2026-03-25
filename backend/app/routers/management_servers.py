import socket
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.management_server import ManagementServer
from app.schemas.management_server import (
    ManagementServerCreate,
    ManagementServerUpdate,
    ManagementServerResponse,
    ManagementServerListResponse,
)

router = APIRouter(prefix="/management-servers", tags=["management-servers"])

_PING_TIMEOUT = 5  # seconds


def _tcp_ping(host: str, port: int, timeout: int = _PING_TIMEOUT) -> tuple[bool, str]:
    """TCP 소켓 연결로 서버 도달 가능 여부 확인"""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, f"{host}:{port} 연결 성공"
    except socket.timeout:
        return False, f"연결 타임아웃 ({timeout}s)"
    except ConnectionRefusedError:
        return False, "연결 거부됨 (포트 닫힘)"
    except socket.gaierror as e:
        return False, f"호스트 확인 실패: {e}"
    except Exception as e:
        return False, str(e)[:100]


@router.get("", response_model=ManagementServerListResponse)
def list_servers(db: Session = Depends(get_db)):
    servers = db.query(ManagementServer).order_by(ManagementServer.name).all()
    return ManagementServerListResponse(data=servers)


@router.get("/{server_id}", response_model=ManagementServerResponse)
def get_server(server_id: UUID, db: Session = Depends(get_db)):
    server = db.query(ManagementServer).filter(ManagementServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")
    return server


@router.post("", response_model=ManagementServerResponse, status_code=status.HTTP_201_CREATED)
def create_server(payload: ManagementServerCreate, db: Session = Depends(get_db)):
    existing = db.query(ManagementServer).filter(ManagementServer.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="같은 이름의 관리서버가 이미 존재합니다.",
        )
    server = ManagementServer(**payload.model_dump())
    db.add(server)
    db.commit()
    db.refresh(server)
    return server


@router.put("/{server_id}", response_model=ManagementServerResponse)
def update_server(server_id: UUID, payload: ManagementServerUpdate, db: Session = Depends(get_db)):
    server = db.query(ManagementServer).filter(ManagementServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(server, k, v)
    db.commit()
    db.refresh(server)
    return server


@router.delete("/{server_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_server(server_id: UUID, db: Session = Depends(get_db)):
    server = db.query(ManagementServer).filter(ManagementServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")
    db.delete(server)
    db.commit()
    return None


@router.post("/{server_id}/ping")
def ping_server(server_id: UUID, db: Session = Depends(get_db)):
    """TCP 연결로 관리서버 도달 가능 여부 확인"""
    server = db.query(ManagementServer).filter(ManagementServer.id == server_id).first()
    if not server:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Server not found")

    ok, detail = _tcp_ping(server.host, server.port or 22)
    server.status = "online" if ok else "offline"
    server.last_checked = datetime.utcnow()
    db.commit()
    db.refresh(server)

    return {"ok": ok, "detail": detail, "status": server.status}
