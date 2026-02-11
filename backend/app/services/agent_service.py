"""
AI Agent Service — Fail-Safe wrapper around Ollama LLM.

If Ollama is offline, unreachable, or returns errors, this service
returns a graceful fallback response instead of raising exceptions.
The main dashboard is NEVER affected by AI availability.
"""

import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a Kubernetes operations assistant embedded in a monitoring dashboard. "
    "You help DevOps engineers diagnose cluster issues, interpret health-check results, "
    "and suggest remediation steps. Be concise, technical, and actionable. "
    "When given cluster context (pod logs, node status, etc.), reference it directly."
)


class AIAgentService:
    """Resilient proxy to a local Ollama instance."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[int] = None,
    ):
        self.base_url = (base_url or settings.ollama_url).rstrip("/")
        self.model = model or settings.ollama_model
        self.timeout = timeout or settings.ollama_timeout

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def health_check(self) -> dict:
        """Quick probe — returns {"status": "online"} or {"status": "offline"}."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/")
                if resp.status_code == 200:
                    return {"status": "online"}
                return {"status": "offline", "detail": f"HTTP {resp.status_code}"}
        except Exception as exc:
            logger.debug("Ollama health-check failed: %s", exc)
            return {"status": "offline", "detail": str(exc)}

    async def ask_agent(self, query: str, context: Optional[dict] = None) -> dict:
        """
        Send a question to the Ollama LLM with optional K8s context.

        Returns
        -------
        dict  with keys:
            status  : "ok" | "offline"
            answer  : str   (LLM response or fallback message)
            model   : str   (model name, empty when offline)
        """
        prompt = self._build_prompt(query, context)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "system": SYSTEM_PROMPT,
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                return {
                    "status": "ok",
                    "answer": data.get("response", ""),
                    "model": data.get("model", self.model),
                }

        # ---- Fail-safe: catch ALL exceptions, never propagate --------
        except httpx.ConnectError:
            logger.warning("Ollama connect error — service may not be deployed.")
            return self._fallback("AI Agent is currently unavailable. Ollama service is not reachable.")

        except httpx.TimeoutException:
            logger.warning("Ollama request timed out after %ss.", self.timeout)
            return self._fallback("AI Agent request timed out. The model may be loading or the server is overloaded.")

        except httpx.HTTPStatusError as exc:
            logger.warning("Ollama returned HTTP %s: %s", exc.response.status_code, exc.response.text[:200])
            return self._fallback(f"AI Agent returned an error (HTTP {exc.response.status_code}).")

        except Exception as exc:
            # Catch-all so nothing leaks to the caller.
            logger.exception("Unexpected error calling Ollama: %s", exc)
            return self._fallback("AI Agent encountered an unexpected error.")

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _fallback(message: str) -> dict:
        return {"status": "offline", "answer": message, "model": ""}

    @staticmethod
    def _build_prompt(query: str, context: Optional[dict] = None) -> str:
        """Inject K8s context into the prompt so the LLM has relevant data."""
        parts: list[str] = []

        if context:
            if context.get("cluster_name"):
                parts.append(f"Cluster: {context['cluster_name']}")
            if context.get("cluster_status"):
                parts.append(f"Cluster status: {context['cluster_status']}")
            if context.get("pod_logs"):
                parts.append(f"Recent pod logs:\n```\n{context['pod_logs']}\n```")
            if context.get("node_status"):
                parts.append(f"Node status:\n{context['node_status']}")
            if context.get("error_messages"):
                msgs = context["error_messages"]
                if isinstance(msgs, list):
                    msgs = "\n".join(msgs)
                parts.append(f"Error messages:\n{msgs}")
            if context.get("extra"):
                parts.append(f"Additional info:\n{context['extra']}")

        if parts:
            ctx_block = "\n\n".join(parts)
            return (
                f"### Cluster Context\n{ctx_block}\n\n"
                f"### User Question\n{query}"
            )
        return query


# Module-level singleton for convenience
agent_service = AIAgentService()
