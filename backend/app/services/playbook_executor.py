"""
Ansible Playbook 실행기

실행 모드:
  - local: subprocess로 직접 실행 (kind/dev 환경)
  - ssh:   master#1에 SSH 접속하여 실행 (production, 미구현 → TODO)

상태 매핑 (ansible JSON callback 출력 기반):
  - 모든 호스트 failures=0, unreachable=0  → healthy (초록)
  - 어느 호스트든 failures > 0             → critical (빨강)
  - 그 외 (unreachable, changed 등)         → warning (주황)
"""
import json
import subprocess
from datetime import datetime
from typing import Any

from app.config import settings


class PlaybookResult:
    def __init__(
        self,
        status: str,
        message: str,
        duration_ms: int = 0,
        stats: dict[str, Any] | None = None,
        raw_output: str = "",
    ):
        self.status = status
        self.message = message
        self.duration_ms = duration_ms
        self.stats = stats or {}
        self.raw_output = raw_output


def run_playbook(
    playbook_path: str,
    inventory_path: str | None = None,
    extra_vars: dict[str, Any] | None = None,
    tags: str | None = None,
    timeout: int | None = None,
) -> PlaybookResult:
    """ansible-playbook을 JSON callback과 함께 실행하고 결과를 파싱합니다."""

    cmd = ["ansible-playbook", playbook_path]

    # inventory
    if inventory_path:
        cmd.extend(["-i", inventory_path])
    else:
        default_inv = f"{settings.ansible_inventory_dir}/clusters.yml"
        cmd.extend(["-i", default_inv])

    # extra vars
    if extra_vars:
        cmd.extend(["-e", json.dumps(extra_vars)])

    # tags
    if tags:
        cmd.extend(["--tags", tags])

    env = {
        "ANSIBLE_STDOUT_CALLBACK": "json",
        "ANSIBLE_LOAD_CALLBACK_PLUGINS": "1",
        "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "HOME": "/root",
    }

    effective_timeout = timeout or settings.check_timeout_seconds

    start = datetime.utcnow()
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=effective_timeout,
            env=env,
        )
        elapsed = int((datetime.utcnow() - start).total_seconds() * 1000)
        return _parse_result(result, elapsed)

    except subprocess.TimeoutExpired:
        elapsed = int((datetime.utcnow() - start).total_seconds() * 1000)
        return PlaybookResult(
            status="critical",
            message=f"Playbook timed out after {effective_timeout}s",
            duration_ms=elapsed,
        )
    except FileNotFoundError:
        return PlaybookResult(
            status="critical",
            message="ansible-playbook command not found. Install ansible in the execution environment.",
            duration_ms=0,
        )
    except Exception as e:
        elapsed = int((datetime.utcnow() - start).total_seconds() * 1000)
        return PlaybookResult(
            status="critical",
            message=f"Execution error: {str(e)}",
            duration_ms=elapsed,
        )


def _parse_result(result: subprocess.CompletedProcess, elapsed: int) -> PlaybookResult:
    """ansible JSON callback 출력을 파싱하여 상태를 결정합니다."""
    raw = result.stdout or ""

    # JSON 파싱 시도
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        # JSON이 아닌 경우 returncode 기반 판단
        if result.returncode == 0:
            return PlaybookResult(
                status="healthy",
                message="Playbook completed successfully (non-JSON output)",
                duration_ms=elapsed,
                raw_output=raw[:2000],
            )
        return PlaybookResult(
            status="critical",
            message=f"Playbook failed (rc={result.returncode}): {result.stderr[:500]}",
            duration_ms=elapsed,
            raw_output=raw[:2000],
        )

    # stats 파싱
    stats = data.get("stats", {})
    if not stats:
        # stats가 없으면 returncode 기반
        status = "healthy" if result.returncode == 0 else "critical"
        return PlaybookResult(
            status=status,
            message="Playbook completed" if status == "healthy" else "Playbook failed",
            duration_ms=elapsed,
            stats=stats,
            raw_output=raw[:2000],
        )

    # 호스트별 통계 집계
    total_ok = 0
    total_changed = 0
    total_failures = 0
    total_unreachable = 0
    total_skipped = 0
    host_details = {}

    for host, host_stats in stats.items():
        ok = host_stats.get("ok", 0)
        changed = host_stats.get("changed", 0)
        failures = host_stats.get("failures", 0)
        unreachable = host_stats.get("unreachable", 0)
        skipped = host_stats.get("skipped", 0)

        total_ok += ok
        total_changed += changed
        total_failures += failures
        total_unreachable += unreachable
        total_skipped += skipped

        host_details[host] = {
            "ok": ok,
            "changed": changed,
            "failures": failures,
            "unreachable": unreachable,
            "skipped": skipped,
        }

    # 상태 결정
    if total_failures > 0:
        status = "critical"
        message = f"Failed: {total_failures} task(s) failed across {len(stats)} host(s)"
    elif total_unreachable > 0:
        status = "warning"
        message = f"Warning: {total_unreachable} host(s) unreachable"
    elif total_changed > 0:
        status = "warning"
        message = f"Changed: {total_changed} task(s) changed across {len(stats)} host(s)"
    else:
        status = "healthy"
        message = f"OK: All {total_ok} task(s) passed across {len(stats)} host(s)"

    summary_stats = {
        "hosts": host_details,
        "totals": {
            "ok": total_ok,
            "changed": total_changed,
            "failures": total_failures,
            "unreachable": total_unreachable,
            "skipped": total_skipped,
            "host_count": len(stats),
        },
    }

    return PlaybookResult(
        status=status,
        message=message,
        duration_ms=elapsed,
        stats=summary_stats,
        raw_output=raw[:5000],
    )
