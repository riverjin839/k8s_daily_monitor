"""데이터 백업 / 복구 서비스.

JSON 기반 애플리케이션-레벨 백업. pg_dump 이 아닌 SQLAlchemy 모델 순회로
포팅 가능한 구조 (PostgreSQL 버전 무관, 다른 환경 이식 가능).

- 모든 테이블을 Base.metadata.sorted_tables 순서로 순회 → FK 의존성 자동 보장.
- UUID / datetime / Enum / bytes / Decimal 은 JSON 친화 형식으로 직렬화.
- 민감 필드 (kubeconfig_content, SSH 비밀번호 없음 — 이미 저장 안 함) 는
  옵션으로 제외 가능.
- 대용량 로그성 테이블 (check_logs, daily_check_logs, cluster_config_snapshots,
  trend_*, ontology_events, topology_audit_logs) 은 옵션으로 포함/제외.
"""
from __future__ import annotations

import base64
import io
import json
import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from sqlalchemy import Table, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.database import Base

BACKUP_VERSION = "1.0"

# 대용량/로그성 — 옵션으로 제외 가능
LOG_TABLES: frozenset[str] = frozenset({
    "check_logs",
    "daily_check_logs",
    "cluster_config_snapshots",
    "topology_audit_logs",
    "ontology_events",
    "trend_items",
    "trend_digests",
})

# 민감 정보 포함 — 옵션으로 마스킹
SENSITIVE_COLUMNS: dict[str, list[str]] = {
    "clusters": ["kubeconfig_content", "kubeconfig_path"],
}


def _sort_key_for_table(t: Table) -> tuple[int, str]:
    """sorted_tables 보조 키 — FK depth + name. sorted_tables 가 기본이라 그대로 사용."""
    return (len(t.foreign_keys), t.name)


def _serialize_value(v: Any) -> Any:
    """JSON 직렬화 가능 값으로 변환."""
    if v is None:
        return None
    if isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, time):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, Enum):
        return v.value
    if isinstance(v, bytes):
        return {"__bytes__": base64.b64encode(v).decode("ascii")}
    if isinstance(v, (list, tuple)):
        return [_serialize_value(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _serialize_value(val) for k, val in v.items()}
    # fallback
    return str(v)


def _deserialize_value(v: Any, col_type_name: str) -> Any:
    if v is None:
        return None
    if isinstance(v, dict) and "__bytes__" in v:
        return base64.b64decode(v["__bytes__"])
    if isinstance(v, str):
        t = col_type_name.upper()
        try:
            if t in ("UUID",):
                return uuid.UUID(v)
            if t in ("DATETIME", "TIMESTAMP"):
                return datetime.fromisoformat(v.replace("Z", "+00:00"))
            if t == "DATE":
                return date.fromisoformat(v)
            if t == "TIME":
                return time.fromisoformat(v)
        except (ValueError, TypeError):
            pass
    return v


def _mask_sensitive(table_name: str, row: dict, include_sensitive: bool) -> dict:
    if include_sensitive:
        return row
    cols = SENSITIVE_COLUMNS.get(table_name, [])
    if not cols:
        return row
    out = dict(row)
    for c in cols:
        if c in out and out[c] is not None:
            out[c] = None
    return out


def _filter_tables(include_logs: bool) -> list[Table]:
    all_tables = list(Base.metadata.sorted_tables)
    if include_logs:
        return all_tables
    return [t for t in all_tables if t.name not in LOG_TABLES]


# ── Export ───────────────────────────────────────────────────────────────

def export_all(
    db: Session,
    *,
    include_logs: bool = False,
    include_sensitive: bool = False,
) -> dict:
    """현재 DB 를 JSON envelope 으로 export."""
    tables = _filter_tables(include_logs)
    data: dict[str, list[dict]] = {}
    counts: dict[str, int] = {}

    for t in tables:
        rows = db.execute(t.select()).mappings().all()
        serialized: list[dict] = []
        for r in rows:
            row_dict = {k: _serialize_value(v) for k, v in dict(r).items()}
            serialized.append(_mask_sensitive(t.name, row_dict, include_sensitive))
        data[t.name] = serialized
        counts[t.name] = len(serialized)

    return {
        "version": BACKUP_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "options": {
            "include_logs": include_logs,
            "include_sensitive": include_sensitive,
        },
        "counts": counts,
        "tables": data,
    }


def export_to_bytes(db: Session, **kwargs) -> tuple[bytes, str]:
    """export_all 결과를 JSON bytes + 파일명 으로."""
    envelope = export_all(db, **kwargs)
    raw = json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8")
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return raw, f"k8s-monitor-backup-{ts}.json"


# ── Import (preview + apply) ─────────────────────────────────────────────

def parse_backup(raw: bytes) -> dict:
    try:
        env = json.loads(raw.decode("utf-8"))
    except Exception as e:
        raise ValueError(f"백업 파일 JSON 파싱 실패: {e}") from e
    if not isinstance(env, dict) or "tables" not in env or "version" not in env:
        raise ValueError("유효한 백업 파일이 아닙니다 (version + tables 필수).")
    return env


def _row_pk_values(table: Table, row: dict) -> tuple:
    return tuple(row.get(pk.name) for pk in table.primary_key.columns)


def compute_diff(db: Session, envelope: dict, *, include_logs: bool) -> dict:
    """import 없이 diff 만 계산 — UI 미리보기용.

    반환: {
      tables: [{
        name, incoming, existing_pk_count,
        insert_count, update_count, unchanged_count, delete_candidates
      }], total_incoming, total_existing
    }
    """
    tables = _filter_tables(include_logs)
    table_by_name = {t.name: t for t in tables}
    incoming_tables = envelope.get("tables", {})
    report: list[dict] = []
    total_in = 0
    total_ex = 0

    for t_name, t in table_by_name.items():
        rows_in = incoming_tables.get(t_name, [])
        total_in += len(rows_in)
        # 현재 DB 의 PK 집합
        existing_pks: set[tuple] = set()
        for r in db.execute(t.select()).mappings().all():
            existing_pks.add(tuple(r[pk.name] for pk in t.primary_key.columns))
        total_ex += len(existing_pks)

        in_pks: set[tuple] = set()
        inserts = 0
        for r in rows_in:
            pk = _row_pk_values(t, r)
            in_pks.add(pk)
            if pk not in existing_pks:
                inserts += 1
        updates = len([pk for pk in in_pks if pk in existing_pks])
        unchanged = 0   # 세부 비교까지 하면 비쌈 — updates 에 포함
        delete_candidates = len(existing_pks - in_pks)

        report.append({
            "name": t_name,
            "incoming": len(rows_in),
            "existing": len(existing_pks),
            "insert_count": inserts,
            "update_count": updates,
            "unchanged_count": unchanged,
            "delete_candidates": delete_candidates,
        })

    return {
        "version": envelope.get("version"),
        "created_at": envelope.get("created_at"),
        "backup_options": envelope.get("options", {}),
        "total_incoming": total_in,
        "total_existing": total_ex,
        "tables": report,
    }


def apply_import(
    db: Session,
    envelope: dict,
    *,
    mode: str = "merge",          # "merge" | "replace"
    include_logs: bool = False,
    dry_run: bool = False,
) -> dict:
    """백업 적용.

    - merge: PK 로 upsert. 기존 DB 에만 있고 백업에 없는 row 는 유지.
    - replace: 대상 테이블 전체 DELETE 후 INSERT (FK 때문에 역순 삭제).
    - dry_run: DB 변경 없이 compute_diff 만 반환.

    전체를 1개 transaction 으로 처리 — 중간 실패 시 롤백.
    """
    if mode not in ("merge", "replace"):
        raise ValueError(f"unknown mode: {mode}")

    diff = compute_diff(db, envelope, include_logs=include_logs)
    if dry_run:
        return {"dry_run": True, "mode": mode, "diff": diff}

    tables = _filter_tables(include_logs)
    incoming = envelope.get("tables", {})
    inserted = 0
    updated = 0
    deleted = 0
    errors: list[str] = []

    engine: Engine = db.get_bind()
    insp = inspect(engine)

    with db.begin_nested():     # SAVEPOINT — 전체 실패 시 rollback
        if mode == "replace":
            # FK 역순 삭제
            for t in reversed(tables):
                try:
                    res = db.execute(t.delete())
                    deleted += res.rowcount or 0
                except Exception as e:
                    errors.append(f"{t.name} DELETE 실패 ({type(e).__name__}): {str(e)[:120]}")

        for t in tables:
            rows = incoming.get(t.name, [])
            if not rows:
                continue

            col_types = {c.name: str(c.type) for c in t.columns}
            col_names = set(col_types.keys())

            for row in rows:
                # 현재 스키마에 없는 컬럼 키 무시 (버전 차이 대응)
                clean: dict = {}
                for k, v in row.items():
                    if k in col_names:
                        clean[k] = _deserialize_value(v, col_types[k])
                if not clean:
                    continue

                pk_cols = [pk.name for pk in t.primary_key.columns]
                pk_vals = {k: clean.get(k) for k in pk_cols}

                try:
                    if mode == "replace":
                        db.execute(t.insert().values(**clean))
                        inserted += 1
                    else:  # merge — upsert by PK
                        where = None
                        for k, v in pk_vals.items():
                            cond = t.c[k] == v
                            where = cond if where is None else where & cond
                        existing = db.execute(t.select().where(where)).first() if where is not None else None
                        if existing is None:
                            db.execute(t.insert().values(**clean))
                            inserted += 1
                        else:
                            non_pk = {k: v for k, v in clean.items() if k not in pk_cols}
                            if non_pk:
                                db.execute(t.update().where(where).values(**non_pk))
                                updated += 1
                except Exception as e:
                    errors.append(
                        f"{t.name} row {pk_vals}: {type(e).__name__}: {str(e)[:120]}"
                    )

        # 시퀀스 동기화 — PostgreSQL 전용 (serial/identity 컬럼이 있는 경우)
        if insp.dialect.name == "postgresql":
            for t in tables:
                for c in t.columns:
                    # serial / identity 컬럼 판단 — server_default 가 nextval 이거나 identity
                    if getattr(c, "server_default", None) is None and not getattr(c, "autoincrement", False):
                        continue
                    try:
                        db.execute(text(
                            f"SELECT setval(pg_get_serial_sequence('{t.name}', '{c.name}'), "
                            f"COALESCE((SELECT MAX({c.name}) FROM {t.name}), 1), "
                            f"(SELECT MAX({c.name}) FROM {t.name}) IS NOT NULL)"
                        ))
                    except Exception:
                        pass  # serial 없는 컬럼은 무시

    db.commit()

    return {
        "dry_run": False,
        "mode": mode,
        "inserted": inserted,
        "updated": updated,
        "deleted": deleted,
        "errors": errors,
        "diff": diff,
    }


# ── Meta ────────────────────────────────────────────────────────────────

def current_meta(db: Session) -> dict:
    """현재 DB 의 테이블 별 row 수 + 전체 요약."""
    tables = list(Base.metadata.sorted_tables)
    counts: dict[str, int] = {}
    for t in tables:
        try:
            r = db.execute(text(f"SELECT count(*) FROM {t.name}")).scalar()
            counts[t.name] = int(r or 0)
        except Exception:
            counts[t.name] = 0
    total = sum(counts.values())
    return {
        "version": BACKUP_VERSION,
        "tables": [
            {"name": n, "rows": counts[n], "is_log": n in LOG_TABLES}
            for n in sorted(counts.keys())
        ],
        "total_rows": total,
        "log_tables": sorted(LOG_TABLES),
    }


# Helpers for routing layer
def bytes_from_upload(fobj: io.IOBase | bytes) -> bytes:
    if isinstance(fobj, bytes):
        return fobj
    data = fobj.read()
    if isinstance(data, str):
        return data.encode("utf-8")
    return data


def _unused() -> Optional[bool]:
    return None
