import csv
import io
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cluster
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, TaskListResponse

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
def list_tasks(
    cluster_id: UUID | None = Query(default=None),
    assignee: str | None = Query(default=None),
    task_category: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    scheduled_from: date | None = Query(default=None),
    scheduled_to: date | None = Query(default=None),
    completed: bool | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """작업 목록 조회 (필터: 클러스터, 담당자, 분류, 우선순위, 예정일 범위, 완료 여부)"""
    query = db.query(Task)
    if cluster_id:
        query = query.filter(Task.cluster_id == cluster_id)
    if assignee:
        query = query.filter(Task.assignee.ilike(f"%{assignee}%"))
    if task_category:
        query = query.filter(Task.task_category.ilike(f"%{task_category}%"))
    if priority:
        query = query.filter(Task.priority == priority)
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
    scheduled_from: date | None = Query(default=None),
    scheduled_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """작업 목록 CSV 다운로드"""
    query = db.query(Task)
    if cluster_id:
        query = query.filter(Task.cluster_id == cluster_id)
    if assignee:
        query = query.filter(Task.assignee.ilike(f"%{assignee}%"))
    if task_category:
        query = query.filter(Task.task_category.ilike(f"%{task_category}%"))
    if priority:
        query = query.filter(Task.priority == priority)
    if scheduled_from:
        query = query.filter(Task.scheduled_at >= scheduled_from)
    if scheduled_to:
        query = query.filter(Task.scheduled_at <= scheduled_to)

    tasks = query.order_by(Task.scheduled_at.desc(), Task.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "담당자",
        "대상 클러스터",
        "작업 분류",
        "작업 내용",
        "작업 결과",
        "우선순위",
        "작업 예정일",
        "작업 완료일",
        "비고",
        "등록일시",
    ])
    for task in tasks:
        writer.writerow([
            task.assignee,
            task.cluster_name or "",
            task.task_category,
            task.task_content,
            task.result_content or "",
            task.priority,
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

    task = Task(
        **{k: v for k, v in payload.model_dump().items() if k != "cluster_name"},
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


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: UUID, db: Session = Depends(get_db)):
    """작업 삭제"""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    db.delete(task)
    db.commit()
    return None
