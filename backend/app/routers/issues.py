import csv
import io
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Issue, Cluster
from app.schemas.issue import IssueCreate, IssueUpdate, IssueResponse, IssueListResponse

router = APIRouter(prefix="/issues", tags=["issues"])


@router.get("", response_model=IssueListResponse)
def list_issues(
    cluster_id: UUID | None = Query(default=None),
    assignee: str | None = Query(default=None),
    issue_area: str | None = Query(default=None),
    occurred_from: date | None = Query(default=None),
    occurred_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """이슈 목록 조회 (필터: 클러스터, 담당자, 이슈부분, 발생일 범위)"""
    query = db.query(Issue)
    if cluster_id:
        query = query.filter(Issue.cluster_id == cluster_id)
    if assignee:
        query = query.filter(Issue.assignee.ilike(f"%{assignee}%"))
    if issue_area:
        query = query.filter(Issue.issue_area.ilike(f"%{issue_area}%"))
    if occurred_from:
        query = query.filter(Issue.occurred_at >= occurred_from)
    if occurred_to:
        query = query.filter(Issue.occurred_at <= occurred_to)

    issues = query.order_by(Issue.occurred_at.desc(), Issue.created_at.desc()).all()
    return IssueListResponse(data=issues, total=len(issues))


@router.get("/export/csv")
def export_csv(
    cluster_id: UUID | None = Query(default=None),
    assignee: str | None = Query(default=None),
    issue_area: str | None = Query(default=None),
    occurred_from: date | None = Query(default=None),
    occurred_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """이슈 목록 CSV 다운로드"""
    query = db.query(Issue)
    if cluster_id:
        query = query.filter(Issue.cluster_id == cluster_id)
    if assignee:
        query = query.filter(Issue.assignee.ilike(f"%{assignee}%"))
    if issue_area:
        query = query.filter(Issue.issue_area.ilike(f"%{issue_area}%"))
    if occurred_from:
        query = query.filter(Issue.occurred_at >= occurred_from)
    if occurred_to:
        query = query.filter(Issue.occurred_at <= occurred_to)

    issues = query.order_by(Issue.occurred_at.desc(), Issue.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    # Header
    writer.writerow([
        "담당자",
        "대상 클러스터",
        "이슈 부분",
        "이슈 내용",
        "조치 내용",
        "이슈 발생일",
        "이슈 조치일",
        "비고",
        "등록일시",
    ])
    for issue in issues:
        writer.writerow([
            issue.assignee,
            issue.cluster_name or "",
            issue.issue_area,
            issue.issue_content,
            issue.action_content or "",
            issue.occurred_at.isoformat() if issue.occurred_at else "",
            issue.resolved_at.isoformat() if issue.resolved_at else "",
            issue.remarks or "",
            issue.created_at.strftime("%Y-%m-%d %H:%M") if issue.created_at else "",
        ])

    output.seek(0)
    # UTF-8 BOM for Excel compatibility
    bom = "\ufeff"
    filename = f"issues-{date.today().isoformat()}.csv"

    return StreamingResponse(
        iter([bom + output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{issue_id}", response_model=IssueResponse)
def get_issue(issue_id: UUID, db: Session = Depends(get_db)):
    """이슈 상세 조회"""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return issue


@router.post("", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
def create_issue(payload: IssueCreate, db: Session = Depends(get_db)):
    """이슈 등록"""
    # cluster_id가 제공된 경우 클러스터 이름 자동 설정
    cluster_name = payload.cluster_name
    if payload.cluster_id and not cluster_name:
        cluster = db.query(Cluster).filter(Cluster.id == payload.cluster_id).first()
        if not cluster:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
        cluster_name = cluster.name

    issue = Issue(
        **{k: v for k, v in payload.model_dump().items() if k != "cluster_name"},
        cluster_name=cluster_name,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


@router.put("/{issue_id}", response_model=IssueResponse)
def update_issue(issue_id: UUID, payload: IssueUpdate, db: Session = Depends(get_db)):
    """이슈 수정"""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    update_data = payload.model_dump(exclude_unset=True)

    # cluster_id 변경 시 cluster_name 자동 갱신
    if "cluster_id" in update_data and update_data["cluster_id"] and "cluster_name" not in update_data:
        cluster = db.query(Cluster).filter(Cluster.id == update_data["cluster_id"]).first()
        if not cluster:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cluster not found")
        update_data["cluster_name"] = cluster.name

    for key, value in update_data.items():
        setattr(issue, key, value)

    db.commit()
    db.refresh(issue)
    return issue


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(issue_id: UUID, db: Session = Depends(get_db)):
    """이슈 삭제"""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    db.delete(issue)
    db.commit()
    return None
