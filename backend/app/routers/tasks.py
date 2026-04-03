import csv
import io
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster
from app.models.task import Task
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskListResponse,
    TaskStatusPatch,
    TaskStatusResponse,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

WIP_LIMIT = 2


@router.get("", response_model=TaskListResponse)
def list_tasks(
    cluster_id: UUID | None = Query(default=None),
    assignee: str | None = Query(default=None),
    task_category: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    kanban_status: str | None = Query(default=None),
    module: str | None = Query(default=None),
    scheduled_from: date | None = Query(default=None),
    scheduled_to: date | None = Query(default=None),
    completed: bool | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """작업 목록 조회 (필터: 클러스터, 담당자, 분류, 우선순위, 칸반상태, 모듈, 예정일 범위, 완료 여부)"""
    query = db.query(Task)
    if cluster_id:
        query = query.filter(Task.cluster_id == cluster_id)
    if assignee:
        query = query.filter(
            Task.primary_assignee.ilike(f"%{assignee}%")
            | Task.secondary_assignee.ilike(f"%{assignee}%")
            | Task.assignee.ilike(f"%{assignee}%")
        )
    if task_category:
        query = query.filter(Task.task_category.ilike(f"%{task_category}%"))
    if priority:
        query = query.filter(Task.priority == priority)
    if kanban_status:
        query = query.filter(Task.kanban_status == kanban_status)
    if module:
        query = query.filter(Task.module == module)
    if scheduled_from:
        query = query.filter(Task.scheduled_at >= scheduled_from)
    if scheduled_to:
        query = query.filter(Task.scheduled_at <= scheduled_to)
    if completed is True:
        query = query.filter(Task.completed_at.isnot(None))
    elif completed is False:
        query = query.filter(Task.completed_at.is_(None))

    tasks = query.order_by(Task.scheduled_at.desc(), Task.created_at.desc()).all()
    return TaskListResponse(data=tasks, total=len(tasks))


@router.get("/export/csv")
def export_csv(
    cluster_id: UUID | None = Query(default=None),
    assignee: str | None = Query(default=None),
    task_category: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    kanban_status: str | None = Query(default=None),
    module: str | None = Query(default=None),
    scheduled_from: date | None = Query(default=None),
    scheduled_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """작업 목록 CSV 다운로드"""
    query = db.query(Task)
    if cluster_id:
        query = query.filter(Task.cluster_id == cluster_id)
    if assignee:
        query = query.filter(
            Task.primary_assignee.ilike(f"%{assignee}%")
            | Task.secondary_assignee.ilike(f"%{assignee}%")
            | Task.assignee.ilike(f"%{assignee}%")
        )
    if task_category:
        query = query.filter(Task.task_category.ilike(f"%{task_category}%"))
    if priority:
        query = query.filter(Task.priority == priority)
    if kanban_status:
        query = query.filter(Task.kanban_status == kanban_status)
    if module:
        query = query.filter(Task.module == module)
    if scheduled_from:
        query = query.filter(Task.scheduled_at >= scheduled_from)
    if scheduled_to:
        query = query.filter(Task.scheduled_at <= scheduled_to)

    tasks = query.order_by(Task.scheduled_at.desc(), Task.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "담당자(정)",
        "담당자(부)",
        "대상 클러스터",
        "모듈",
        "작업 분류",
        "유형",
        "작업 내용",
        "완료 조건",
        "작업 결과",
        "우선순위",
        "칸반 상태",
        "예상 시간(h)",
        "작업 예정일",
        "작업 완료일",
        "비고",
        "등록일시",
    ])
    for task in tasks:
        writer.writerow([
            task.primary_assignee,
            task.secondary_assignee or "",
            task.cluster_name or "",
            task.module or "",
            task.task_category,
            task.type_label or "",
            task.task_content,
            task.done_condition or "",
            task.result_content or "",
            task.priority,
            task.kanban_status,
            task.effort_hours or "",
            task.scheduled_at.isoformat() if task.scheduled_at else "",
            task.completed_at.isoformat() if task.completed_at else "",
            task.remarks or "",
            task.created_at.strftime("%Y-%m-%d %H:%M") if task.created_at else "",
        ])

    output.seek(0)
    bom = "\ufeff"
    filename = f"tasks-{date.today().isoformat()}.csv"

    return StreamingResponse(
        iter([bom + output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/today/summary")
def get_today_tasks(date: Optional[str] = None, db: Session = Depends(get_db)):
    """
    할일 게시판 데이터 (date 미입력 시 오늘):
    - 지정일 예정된 작업 (scheduled_at = 해당일)
    - 진행 중인 작업 (kanban_status = in_progress, 해당일 제외)
    담당자별로 그룹화해서 반환.
    """
    if date:
        try:
            target = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            target = datetime.utcnow()
    else:
        target = datetime.utcnow()
    today_start = target.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start.replace(hour=23, minute=59, second=59)

    # 오늘 예정 작업 (완료 포함)
    today_tasks = (
        db.query(Task)
        .filter(
            Task.scheduled_at >= today_start,
            Task.scheduled_at <= today_end,
        )
        .order_by(Task.primary_assignee, Task.priority)
        .all()
    )

    # 진행 중 작업 (오늘 예정이 아닌 것 중 in_progress)
    in_progress_tasks = (
        db.query(Task)
        .filter(
            Task.kanban_status == "in_progress",
            ~(
                (Task.scheduled_at >= today_start) &
                (Task.scheduled_at <= today_end)
            ),
        )
        .order_by(Task.primary_assignee, Task.priority)
        .all()
    )

    # 담당자별 그룹화
    assignee_map: dict[str, dict] = {}
    for task in today_tasks:
        key = task.primary_assignee or task.assignee or "미지정"
        if key not in assignee_map:
            assignee_map[key] = {"assignee": key, "today_tasks": [], "in_progress_tasks": []}
        assignee_map[key]["today_tasks"].append(task)

    for task in in_progress_tasks:
        key = task.primary_assignee or task.assignee or "미지정"
        if key not in assignee_map:
            assignee_map[key] = {"assignee": key, "today_tasks": [], "in_progress_tasks": []}
        assignee_map[key]["in_progress_tasks"].append(task)

    # 직렬화
    def serialize_task(t: Task) -> dict:
        return {
            "id": str(t.id),
            "assignee": t.assignee,
            "primary_assignee": t.primary_assignee,
            "secondary_assignee": t.secondary_assignee,
            "cluster_id": str(t.cluster_id) if t.cluster_id else None,
            "cluster_name": t.cluster_name,
            "task_category": t.task_category,
            "task_content": t.task_content,
            "result_content": t.result_content,
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "priority": t.priority,
            "remarks": t.remarks,
            "kanban_status": t.kanban_status,
            "module": t.module,
            "type_label": t.type_label,
            "effort_hours": t.effort_hours,
            "done_condition": t.done_condition,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }

    result = []
    for key in sorted(assignee_map.keys()):
        group = assignee_map[key]
        result.append({
            "assignee": group["assignee"],
            "today_tasks": [serialize_task(t) for t in group["today_tasks"]],
            "in_progress_tasks": [serialize_task(t) for t in group["in_progress_tasks"]],
        })

    return {
        "date": today_start.strftime("%Y-%m-%d"),
        "total_today": len(today_tasks),
        "total_in_progress": len(in_progress_tasks),
        "groups": result,
    }


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: UUID, db: Session = Depends(get_db)):
    """작업 상세 조회"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)):
    """작업 등록"""
    cluster_name = payload.cluster_name
    if payload.cluster_id and not cluster_name:
        cluster = db.query(Cluster).filter(Cluster.id == payload.cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
        cluster_name = cluster.name

    primary_assignee = (payload.primary_assignee or payload.assignee).strip()
    secondary_assignee = payload.secondary_assignee.strip() if payload.secondary_assignee else None
    task = Task(
        **{k: v for k, v in payload.model_dump().items() if k != "cluster_name"},
        assignee=primary_assignee,
        primary_assignee=primary_assignee,
        secondary_assignee=secondary_assignee,
        cluster_name=cluster_name,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(task_id: UUID, payload: TaskUpdate, db: Session = Depends(get_db)):
    """작업 수정"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "primary_assignee" in update_data:
        update_data["assignee"] = update_data["primary_assignee"]
    elif "assignee" in update_data:
        update_data["primary_assignee"] = update_data["assignee"]

    if "cluster_id" in update_data and update_data["cluster_id"] and "cluster_name" not in update_data:
        cluster = db.query(Cluster).filter(Cluster.id == update_data["cluster_id"]).first()
        if not cluster:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
        update_data["cluster_name"] = cluster.name

    for key, value in update_data.items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/status", response_model=TaskStatusResponse)
def patch_task_status(task_id: UUID, payload: TaskStatusPatch, db: Session = Depends(get_db)):
    """칸반 컬럼 이동 — WIP 초과 시 wip_warning: true 반환 (이동은 허용)"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    wip_warning = False
    if payload.kanban_status == "in_progress":
        wip_count = (
            db.query(Task)
            .filter(Task.kanban_status == "in_progress", Task.id != task_id)
            .count()
        )
        if wip_count >= WIP_LIMIT:
            wip_warning = True

    task.kanban_status = payload.kanban_status

    # done 으로 이동 시 completed_at 자동 기록 (미설정인 경우만)
    if payload.kanban_status == "done" and not task.completed_at:
        task.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(task)
    return TaskStatusResponse(data=task, wip_warning=wip_warning)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: UUID, db: Session = Depends(get_db)):
    """작업 삭제"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    db.delete(task)
    db.commit()
    return None
