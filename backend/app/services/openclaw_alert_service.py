"""
OpenClaw Alert Service — Receives alerts from the OpenClaw agent pod and
dispatches them to Telegram / Slack.

OpenClaw watches K8s events (read-only) inside the cluster and POSTs
detected errors to the backend webhook.  This service:
  1. Validates & enriches the alert payload
  2. Optionally asks the local Ollama LLM for a remediation suggestion
  3. Forwards the final message to configured messenger channels
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Messenger Dispatchers
# ------------------------------------------------------------------

async def _send_telegram(message: str) -> bool:
    """Send a message via Telegram Bot API."""
    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    if not token or not chat_id:
        logger.debug("Telegram not configured — skipping.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "Markdown",
            })
            if resp.status_code == 200:
                logger.info("Telegram alert sent.")
                return True
            logger.warning("Telegram API returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Telegram send failed: %s", exc)
    return False


async def _send_slack(message: str) -> bool:
    """Send a message via Slack Incoming Webhook."""
    webhook_url = settings.slack_webhook_url
    if not webhook_url:
        logger.debug("Slack not configured — skipping.")
        return False

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(webhook_url, json={"text": message})
            if resp.status_code == 200:
                logger.info("Slack alert sent.")
                return True
            logger.warning("Slack webhook returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Slack send failed: %s", exc)
    return False


# ------------------------------------------------------------------
# AI Enrichment (optional)
# ------------------------------------------------------------------

async def _enrich_with_ai(alert_text: str) -> Optional[str]:
    """Ask Ollama for a short remediation suggestion."""
    try:
        prompt = (
            "You are a Kubernetes SRE assistant. A monitoring agent detected "
            "the following error alert. Provide a SHORT (2-3 sentences) remediation "
            f"suggestion.\n\nAlert:\n{alert_text}"
        )
        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": prompt,
                    "stream": False,
                },
            )
            if resp.status_code == 200:
                return resp.json().get("response", "")
    except Exception as exc:
        logger.debug("AI enrichment skipped: %s", exc)
    return None


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------

class OpenClawAlertService:
    """Process incoming OpenClaw alert webhooks."""

    # In-memory buffer of recent alerts (capped) — useful for the dashboard
    _recent_alerts: list[dict] = []
    MAX_RECENT = 100

    async def process_alert(self, payload: dict) -> dict:
        """
        Validate, enrich, dispatch a single alert.

        Expected payload keys:
            severity   : "critical" | "warning" | "info"
            pod_name   : str
            namespace  : str
            reason     : str (K8s event reason)
            message    : str (human-readable alert text)
            timestamp  : str (ISO 8601, optional)
        """
        severity = payload.get("severity", "warning").upper()
        pod_name = payload.get("pod_name", "unknown")
        namespace = payload.get("namespace", "unknown")
        reason = payload.get("reason", "")
        message = payload.get("message", "No details")
        ts = payload.get("timestamp") or datetime.now(timezone.utc).isoformat()

        # Build alert text
        alert_text = (
            f"*[{severity}] K8s Alert*\n"
            f"Pod: `{pod_name}` | Namespace: `{namespace}`\n"
            f"Reason: {reason}\n"
            f"Message: {message}\n"
            f"Time: {ts}"
        )

        # Optional: AI-enriched remediation
        ai_suggestion = await _enrich_with_ai(alert_text)
        if ai_suggestion:
            alert_text += f"\n\n_AI Suggestion_: {ai_suggestion}"

        # Dispatch to all configured channels
        tg_ok = await _send_telegram(alert_text)
        slack_ok = await _send_slack(alert_text)

        # Store in recent buffer
        record = {
            "severity": severity,
            "pod_name": pod_name,
            "namespace": namespace,
            "reason": reason,
            "message": message,
            "ai_suggestion": ai_suggestion or "",
            "timestamp": ts,
            "dispatched": {"telegram": tg_ok, "slack": slack_ok},
        }
        self._recent_alerts.insert(0, record)
        if len(self._recent_alerts) > self.MAX_RECENT:
            self._recent_alerts = self._recent_alerts[:self.MAX_RECENT]

        dispatched_to = []
        if tg_ok:
            dispatched_to.append("telegram")
        if slack_ok:
            dispatched_to.append("slack")

        return {
            "status": "dispatched" if dispatched_to else "no_channel",
            "channels": dispatched_to,
            "ai_enriched": ai_suggestion is not None,
        }

    def get_recent_alerts(self, limit: int = 20) -> list[dict]:
        """Return the N most recent alerts."""
        return self._recent_alerts[:limit]

    def get_status(self) -> dict:
        """Return OpenClaw integration status."""
        has_telegram = bool(settings.telegram_bot_token and settings.telegram_chat_id)
        has_slack = bool(settings.slack_webhook_url)
        return {
            "enabled": True,
            "channels": {
                "telegram": has_telegram,
                "slack": has_slack,
            },
            "recent_alert_count": len(self._recent_alerts),
        }


# Module-level singleton
openclaw_alert_service = OpenClawAlertService()
