"""Super Pod (in_cluster 모드) 가 관리 backend 의 ingest API 로 결과를 푸시.

bearer 토큰 인증. 네트워크 일시 장애에 대비해 지수 백오프 (2s, 4s, 8s, 16s) 로 4회 재시도.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def post_ingest(
    url: str,
    token: str,
    payload: dict[str, Any],
    *,
    timeout: int = 30,
    max_retries: int = 4,
) -> dict[str, Any]:
    """Ingest API 로 결과 POST. 실패 시 지수 백오프 재시도."""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    last_error: str | None = None
    for attempt in range(max_retries + 1):
        try:
            with httpx.Client(timeout=timeout, verify=False) as cli:
                resp = cli.post(url, json=payload, headers=headers)
                if resp.status_code < 300:
                    return {"status": "ok", "http_status": resp.status_code, "body": resp.text[:1000]}
                last_error = f"HTTP {resp.status_code}: {resp.text[:300]}"
        except Exception as e:
            last_error = str(e)[:300]

        if attempt < max_retries:
            wait = 2 ** (attempt + 1)
            logger.warning("Ingest attempt %d failed (%s) — sleeping %ds", attempt + 1, last_error, wait)
            time.sleep(wait)

    return {"status": "error", "error": last_error}
