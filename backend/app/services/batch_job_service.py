"""Glue between BatchJob DB rows and registered executors."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import BatchJob, BatchJobRun
from app.services.batch_jobs import (
    ExecutionContext,
    ExecutionResult,
    get_executor,
)


class BatchJobNotFound(Exception):
    pass


class UnknownJobType(Exception):
    pass


async def execute_job(
    db: Session,
    job: BatchJob,
    *,
    host: Optional[str] = None,
    port: Optional[int] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
    private_key: Optional[str] = None,
    param_override: Optional[dict] = None,
    timeout: int = 60,
    trigger: str = "manual",
) -> tuple[BatchJobRun, ExecutionResult]:
    """Run a registered job and persist the result as a BatchJobRun row."""
    executor = get_executor(job.job_type)
    if executor is None:
        raise UnknownJobType(job.job_type)

    target_host = host or job.default_host
    if not target_host:
        raise ValueError("host is required (no default_host set on the job)")

    merged_params = executor.merge_params(saved=job.params, override=param_override)
    ctx = ExecutionContext(
        host=target_host,
        port=port or job.default_port or 22,
        username=username or job.default_username or "root",
        password=password,
        private_key=private_key,
        params=merged_params,
        timeout=timeout,
    )

    job.last_status = "running"
    db.commit()

    started_at = datetime.utcnow()
    try:
        result = await executor.run(ctx)
    except Exception as exc:
        result = ExecutionResult(status="error", error=str(exc)[:500])
    finished_at = datetime.utcnow()

    run = BatchJobRun(
        job_id=job.id,
        status=result.status,
        trigger=trigger,
        host=target_host,
        executed_command=(result.executed_command or "")[:2000],
        exit_code=result.exit_code,
        stdout=result.stdout or "",
        stderr=result.stderr or "",
        error=(result.error or None) and result.error[:1000],
        duration_ms=result.duration_ms,
        started_at=started_at,
        finished_at=finished_at,
    )
    db.add(run)

    job.last_status = result.status
    job.last_run_at = finished_at
    db.commit()
    db.refresh(run)

    return run, result


def get_job_or_404(db: Session, job_id: UUID) -> BatchJob:
    job = db.query(BatchJob).filter(BatchJob.id == job_id).first()
    if not job:
        raise BatchJobNotFound(str(job_id))
    return job
