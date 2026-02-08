from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster, Playbook
from app.schemas.playbook import (
    PlaybookCreate,
    PlaybookUpdate,
    PlaybookResponse,
    PlaybookListResponse,
    PlaybookRunResponse,
)
from app.services.playbook_executor import run_playbook

router = APIRouter(prefix="/playbooks", tags=["playbooks"])

STATUS_LABEL = {
    "healthy": "OK",
    "warning": "Changed",
    "critical": "FAILED",
    "running": "Running",
    "unknown": "Not Run",
}


@router.get("", response_model=PlaybookListResponse)
def list_playbooks(
    cluster_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """클러스터별 또는 전체 Playbook 목록 조회"""
    query = db.query(Playbook)
    if cluster_id:
        query = query.filter(Playbook.cluster_id == cluster_id)
    playbooks = query.order_by(Playbook.created_at.desc()).all()
    return PlaybookListResponse(data=playbooks)


@router.get("/report")
def export_report(
    cluster_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Playbook 실행 결과를 Markdown 테이블로 내보내기"""
    query = db.query(Playbook).join(Cluster)
    if cluster_id:
        query = query.filter(Playbook.cluster_id == cluster_id)
    playbooks = query.order_by(Cluster.name, Playbook.name).all()

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    today = datetime.utcnow().strftime("%Y-%m-%d")

    lines = [
        f"# K8s Daily Check Report",
        f"",
        f"> Generated: {now}",
        f"",
    ]

    # 클러스터별 그룹
    clusters: dict[str, list] = {}
    for pb in playbooks:
        cname = pb.cluster.name
        clusters.setdefault(cname, []).append(pb)

    if not clusters:
        lines.append("No playbooks registered.")
    else:
        for cluster_name, pbs in clusters.items():
            lines.append(f"## Cluster: {cluster_name}")
            lines.append("")
            lines.append("| 검사 항목 | 날짜 | 상태 | 수치 |")
            lines.append("|-----------|------|------|------|")

            for pb in pbs:
                name = pb.name
                run_date = pb.last_run_at.strftime("%Y-%m-%d %H:%M") if pb.last_run_at else "-"
                status_label = STATUS_LABEL.get(pb.status, pb.status)
                stats_str = _format_stats(pb.last_result)
                lines.append(f"| {name} | {run_date} | {status_label} | {stats_str} |")

            lines.append("")

    md_content = "\n".join(lines)
    filename = f"k8s-daily-report-{today}.md"

    return PlainTextResponse(
        content=md_content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _format_stats(last_result: dict | None) -> str:
    """last_result에서 수치 문자열 생성"""
    if not last_result:
        return "-"
    stats = last_result.get("stats", {})
    totals = stats.get("totals")
    if not totals:
        # totals 없으면 message만
        msg = last_result.get("message", "-")
        return msg[:60]

    parts = []
    for key in ("ok", "changed", "failures", "unreachable", "skipped"):
        val = totals.get(key, 0)
        if val > 0 or key in ("ok", "failures"):
            parts.append(f"{key}={val}")
    host_count = totals.get("host_count", 0)
    if host_count:
        parts.append(f"hosts={host_count}")
    duration = last_result.get("duration_ms")
    if duration is not None:
        parts.append(f"{duration}ms")
    return ", ".join(parts)


@router.get("/dashboard/{cluster_id}", response_model=PlaybookListResponse)
def get_dashboard_playbooks(cluster_id: UUID, db: Session = Depends(get_db)):
    """Dashboard에 표시할 Playbook 목록 (show_on_dashboard=True)"""
    playbooks = (
        db.query(Playbook)
        .filter(Playbook.cluster_id == cluster_id, Playbook.show_on_dashboard.is_(True))
        .order_by(Playbook.name)
        .all()
    )
    return PlaybookListResponse(data=playbooks)


@router.patch("/{playbook_id}/dashboard", response_model=PlaybookResponse)
def toggle_dashboard(playbook_id: UUID, db: Session = Depends(get_db)):
    """Playbook의 Dashboard 표시 토글"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    playbook.show_on_dashboard = not playbook.show_on_dashboard
    db.commit()
    db.refresh(playbook)
    return playbook


@router.get("/{playbook_id}", response_model=PlaybookResponse)
def get_playbook(playbook_id: UUID, db: Session = Depends(get_db)):
    """Playbook 상세 조회"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")
    return playbook


@router.post("", response_model=PlaybookResponse, status_code=status.HTTP_201_CREATED)
def create_playbook(payload: PlaybookCreate, db: Session = Depends(get_db)):
    """새 Playbook 등록"""
    # 클러스터 존재 확인
    cluster = db.query(Cluster).filter(Cluster.id == payload.cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")

    # 중복 체크 (같은 클러스터에 같은 이름)
    existing = (
        db.query(Playbook)
        .filter(Playbook.cluster_id == payload.cluster_id, Playbook.name == payload.name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Playbook '{payload.name}' already exists for this cluster",
        )

    playbook = Playbook(**payload.model_dump())
    db.add(playbook)
    db.commit()
    db.refresh(playbook)
    return playbook


@router.put("/{playbook_id}", response_model=PlaybookResponse)
def update_playbook(playbook_id: UUID, payload: PlaybookUpdate, db: Session = Depends(get_db)):
    """Playbook 수정"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(playbook, key, value)

    db.commit()
    db.refresh(playbook)
    return playbook


@router.delete("/{playbook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_playbook(playbook_id: UUID, db: Session = Depends(get_db)):
    """Playbook 삭제"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    db.delete(playbook)
    db.commit()
    return None


@router.post("/{playbook_id}/run", response_model=PlaybookRunResponse)
def run_playbook_endpoint(playbook_id: UUID, db: Session = Depends(get_db)):
    """Playbook 실행 (동기)"""
    playbook = db.query(Playbook).filter(Playbook.id == playbook_id).first()
    if not playbook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Playbook not found")

    # running 상태로 업데이트
    playbook.status = "running"
    db.commit()

    # 실행
    result = run_playbook(
        playbook_path=playbook.playbook_path,
        inventory_path=playbook.inventory_path,
        extra_vars=playbook.extra_vars,
        tags=playbook.tags,
    )

    # 결과 저장
    playbook.status = result.status
    playbook.last_run_at = datetime.utcnow()
    playbook.last_result = {
        "message": result.message,
        "stats": result.stats,
        "duration_ms": result.duration_ms,
        "raw_output": result.raw_output[:5000] if result.raw_output else None,
    }
    db.commit()
    db.refresh(playbook)

    return PlaybookRunResponse(
        id=playbook.id,
        status=result.status,
        message=result.message,
        stats=result.stats,
        duration_ms=result.duration_ms,
    )
