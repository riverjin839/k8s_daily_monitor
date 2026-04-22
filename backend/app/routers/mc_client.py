"""MinIO mc client 원격 실행.

etcdctl 과 비슷한 패턴: 특정 호스트에 SSH 로 접속 후 mc 명령 실행.
기본값으로 alias 가 이미 설정돼 있다고 가정(`mc alias set` 은 여기서
직접 별도로 수행). 필요하면 extra_env 로 MC_CONFIG_DIR 등 지정 가능.
"""
import shlex
import time
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster
from app.services.ssh_runner import SSHTarget, run_bulk

router = APIRouter(tags=["mc"])


# ── 프리셋 ───────────────────────────────────────────────────────────────────

PRESETS: dict[str, dict[str, str]] = {
    "alias-list":    {"label": "alias 목록",            "args": "alias list"},
    "admin-info":    {"label": "admin info (서버 상태)", "args": "admin info {alias}"},
    "ls":            {"label": "버킷 목록 (ls)",         "args": "ls {alias}"},
    "du":            {"label": "용량 (du)",              "args": "du {alias} --depth 1"},
    "admin-user-list": {"label": "사용자 목록",          "args": "admin user list {alias}"},
    "admin-policy-list": {"label": "정책 목록",          "args": "admin policy list {alias}"},
    "admin-heal-status": {"label": "Heal 상태",          "args": "admin heal {alias} --dry-run --recursive"},
    "admin-service-status": {"label": "서비스 상태",     "args": "admin service status {alias}"},
    "admin-config-history": {"label": "설정 이력",       "args": "admin config history {alias} --limit 10"},
    "version":       {"label": "mc 버전 확인",           "args": "--version"},
}


# ── schemas ──────────────────────────────────────────────────────────────────

class McRequest(BaseModel):
    host: str = Field(..., description="mc 가 설치된 호스트 (master 혹은 bastion)")
    port: int = 22
    username: str = "root"
    password: Optional[str] = None
    private_key: Optional[str] = None

    args: str = Field(..., description="mc 에 붙일 인자. {alias} placeholder 사용 가능.")
    alias: str = Field(default="local", description="{alias} 를 대체할 값")
    mc_path: str = Field(default="mc", description="mc 바이너리 경로 (PATH 상이면 'mc')")
    extra_env: dict[str, str] = Field(default_factory=dict)
    timeout: int = Field(default=60, ge=1, le=600)


class McResponse(BaseModel):
    host: str
    status: Literal["ok", "error", "timeout", "auth_error", "connect_error"]
    exit_code: Optional[int] = None
    stdout: str = ""
    stderr: str = ""
    duration_ms: int = 0
    error: Optional[str] = None
    executed_command: str = ""


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/clusters/{cluster_id}/mc/presets")
def list_presets(cluster_id: UUID, db: Session = Depends(get_db)):
    # cluster_id 는 URL 패턴 일관성을 위한 용도 (검증 목적)
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
    return {"presets": [{"key": k, **v} for k, v in PRESETS.items()]}


def _build_mc_command(req: McRequest) -> str:
    parts: list[str] = []
    for k, v in (req.extra_env or {}).items():
        if not k.replace("_", "").isalnum():
            continue
        parts.append(f"export {k}={shlex.quote(v)}")
    # {alias} placeholder 치환
    args = req.args.replace("{alias}", req.alias)
    parts.append(f"{shlex.quote(req.mc_path)} {args}")
    return " && ".join(parts) if len(parts) > 1 else parts[0]


@router.post("/clusters/{cluster_id}/mc/run", response_model=McResponse)
async def run_mc(cluster_id: UUID, payload: McRequest, db: Session = Depends(get_db)):
    """SSH 접속 후 mc 명령 실행."""
    if not payload.password and not payload.private_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="password 또는 private_key 중 하나는 필수입니다.",
        )
    if not payload.args.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="args 는 비어있을 수 없습니다.",
        )
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    bash_cmd = _build_mc_command(payload)
    remote_cmd = f"bash -lc {shlex.quote(bash_cmd)}"

    target = SSHTarget(
        host=payload.host, port=payload.port, username=payload.username,
        password=payload.password, private_key=payload.private_key,
    )
    start = time.monotonic()
    results = await run_bulk(
        [target],
        action="ssh",
        command=remote_cmd,
        mode="sequential",
        connect_timeout=min(payload.timeout, 10),
        exec_timeout=payload.timeout,
        parallelism=1,
    )
    r = results[0]
    _ = start
    return McResponse(
        host=r.host, status=r.status, exit_code=r.exit_code,
        stdout=r.stdout, stderr=r.stderr, duration_ms=r.duration_ms,
        error=r.error, executed_command=bash_cmd,
    )
