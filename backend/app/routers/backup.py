"""데이터 백업 / 복구 엔드포인트 — Settings 페이지 연동.

- GET  /backup/meta           → 현재 DB 요약 (테이블/row 수)
- GET  /backup/export         → JSON 파일 다운로드
- POST /backup/import/preview → 업로드된 백업 파일의 diff 미리보기 (dry-run)
- POST /backup/import         → 실제 적용 (merge | replace)
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.backup import (
    BackupImportPreviewResponse,
    BackupImportResponse,
    BackupMetaResponse,
)
from app.services.backup_service import (
    apply_import,
    current_meta,
    export_to_bytes,
    parse_backup,
)

router = APIRouter(prefix="/backup", tags=["backup"])


@router.get("/meta", response_model=BackupMetaResponse)
def get_meta(db: Session = Depends(get_db)):
    return BackupMetaResponse.model_validate(current_meta(db))


@router.get("/export")
def export_backup(
    include_logs: bool = Query(default=False, description="로그성 테이블 포함 여부"),
    include_sensitive: bool = Query(default=False, description="kubeconfig 등 민감 필드 포함 여부"),
    db: Session = Depends(get_db),
):
    raw, filename = export_to_bytes(
        db,
        include_logs=include_logs,
        include_sensitive=include_sensitive,
    )
    return Response(
        content=raw,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Backup-Bytes": str(len(raw)),
        },
    )


@router.post("/import/preview", response_model=BackupImportPreviewResponse)
async def import_preview(
    file: UploadFile = File(..., description="JSON 백업 파일"),
    mode: str = Form(default="merge"),
    include_logs: bool = Form(default=False),
    db: Session = Depends(get_db),
):
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=422, detail="mode 는 'merge' 또는 'replace' 이어야 합니다.")
    try:
        raw = await file.read()
        envelope = parse_backup(raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    result = apply_import(db, envelope, mode=mode, include_logs=include_logs, dry_run=True)
    # dry_run=True 경로는 "diff" 필드만 채워진 dict 반환
    result.setdefault("inserted", 0)
    result.setdefault("updated", 0)
    result.setdefault("deleted", 0)
    result.setdefault("errors", [])
    return BackupImportPreviewResponse.model_validate(result)


@router.post("/import", response_model=BackupImportResponse)
async def import_apply(
    file: UploadFile = File(..., description="JSON 백업 파일"),
    mode: str = Form(default="merge"),
    include_logs: bool = Form(default=False),
    confirm: bool = Form(default=False, description="replace 모드는 반드시 True 이어야 실행"),
    db: Session = Depends(get_db),
):
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=422, detail="mode 는 'merge' 또는 'replace' 이어야 합니다.")
    if mode == "replace" and not confirm:
        raise HTTPException(
            status_code=422,
            detail="'replace' 모드는 기존 데이터를 모두 덮어씁니다. confirm=true 를 명시하세요.",
        )
    try:
        raw = await file.read()
        envelope = parse_backup(raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    try:
        result = apply_import(db, envelope, mode=mode, include_logs=include_logs, dry_run=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"복구 실패 ({type(e).__name__}): {str(e)[:200]}") from e
    return BackupImportResponse.model_validate(result)
