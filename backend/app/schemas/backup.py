from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class BackupMetaTable(BaseModel):
    name: str
    rows: int
    is_log: bool = False


class BackupMetaResponse(BaseModel):
    version: str
    total_rows: int
    tables: list[BackupMetaTable]
    log_tables: list[str]


class BackupExportOptions(BaseModel):
    include_logs: bool = False
    include_sensitive: bool = False


class BackupImportTableDiff(BaseModel):
    name: str
    incoming: int
    existing: int
    insert_count: int
    update_count: int
    unchanged_count: int
    delete_candidates: int


class BackupImportDiff(BaseModel):
    version: Optional[str] = None
    created_at: Optional[str] = None
    backup_options: dict = Field(default_factory=dict)
    total_incoming: int
    total_existing: int
    tables: list[BackupImportTableDiff]


class BackupImportResponse(BaseModel):
    dry_run: bool
    mode: Literal["merge", "replace"]
    inserted: int = 0
    updated: int = 0
    deleted: int = 0
    errors: list[str] = Field(default_factory=list)
    diff: BackupImportDiff


class BackupImportPreviewResponse(BaseModel):
    dry_run: Literal[True] = True
    mode: Literal["merge", "replace"]
    diff: BackupImportDiff
    # 참고: preview 시엔 inserted/updated/deleted 0
    inserted: int = 0
    updated: int = 0
    deleted: int = 0
    errors: list[str] = Field(default_factory=list)
