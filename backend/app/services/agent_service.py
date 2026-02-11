"""
AI Agent Service — Fail-Safe wrapper around Ollama LLM.

If Ollama is offline, unreachable, or returns errors, this service
returns a graceful fallback response instead of raising exceptions.
The main dashboard is NEVER affected by AI availability.
"""

import json
import logging
from typing import AsyncIterator, Optional

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
                if resp.status_code != 200:
                    return {"status": "offline", "detail": f"HTTP {resp.status_code}"}
                # Check if the model is available
                tags_resp = await client.get(f"{self.base_url}/api/tags")
                if tags_resp.status_code == 200:
                    models = tags_resp.json().get("models", [])
                    model_names = [m.get("name", "").split(":")[0] for m in models]
                    if self.model not in model_names:
                        return {
                            "status": "online",
                            "detail": f"Server running but model '{self.model}' not pulled. Available: {model_names or 'none'}",
                        }
                return {"status": "online"}
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
            code = exc.response.status_code
            logger.warning("Ollama returned HTTP %s: %s", code, exc.response.text[:200])
            if code == 404:
                return self._fallback(
                    f"Model '{self.model}' is not available. "
                    "It may still be downloading. Use the pull-model endpoint or wait for auto-pull to finish."
                )
            return self._fallback(f"AI Agent returned an error (HTTP {code}).")

        except Exception as exc:
            # Catch-all so nothing leaks to the caller.
            logger.exception("Unexpected error calling Ollama: %s", exc)
            return self._fallback("AI Agent encountered an unexpected error.")

    async def pull_model(self, model: Optional[str] = None) -> dict:
        """Trigger model pull on Ollama. Returns status immediately (pull runs server-side)."""
        target = model or self.model
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self.base_url}/api/pull",
                    json={"name": target, "stream": False},
                )
                if resp.status_code == 200:
                    return {"status": "ok", "message": f"Model '{target}' pull initiated."}
                return {"status": "error", "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except httpx.ConnectError:
            return {"status": "offline", "message": "Ollama service is not reachable."}
        except httpx.TimeoutException:
            return {"status": "ok", "message": f"Model '{target}' pull started (large model, request timed out but pull continues server-side)."}
        except Exception as exc:
            logger.exception("Error pulling model: %s", exc)
            return {"status": "error", "message": str(exc)}

    async def pull_model_stream(self, model: Optional[str] = None) -> AsyncIterator[str]:
        """Stream model pull progress from Ollama as SSE events.

        Yields JSON strings with keys: status, percent, completed_bytes, total_bytes
        """
        target = model or self.model
        layer_totals: dict[str, int] = {}
        layer_completed: dict[str, int] = {}

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(None)) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/pull",
                    json={"name": target, "stream": True},
                ) as response:
                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        status = data.get("status", "")
                        digest = data.get("digest", "")
                        total = data.get("total", 0)
                        completed = data.get("completed", 0)

                        # Track per-layer progress
                        if digest and total > 0:
                            layer_totals[digest] = total
                            layer_completed[digest] = completed

                        # Calculate overall progress
                        sum_total = sum(layer_totals.values())
                        sum_completed = sum(layer_completed.values())
                        percent = round((sum_completed / sum_total * 100), 1) if sum_total > 0 else 0

                        event = {
                            "status": status,
                            "percent": percent,
                            "completedBytes": sum_completed,
                            "totalBytes": sum_total,
                        }

                        if status == "success":
                            event["percent"] = 100

                        yield json.dumps(event)

        except httpx.ConnectError:
            yield json.dumps({"status": "error", "percent": 0, "completedBytes": 0, "totalBytes": 0, "error": "Ollama service is not reachable."})
        except Exception as exc:
            logger.exception("Error streaming model pull: %s", exc)
            yield json.dumps({"status": "error", "percent": 0, "completedBytes": 0, "totalBytes": 0, "error": str(exc)})

    async def list_models(self) -> dict:
        """List models available on Ollama."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code == 200:
                    models = resp.json().get("models", [])
                    return {"status": "ok", "models": [m.get("name", "") for m in models]}
                return {"status": "error", "models": []}
        except Exception:
            return {"status": "offline", "models": []}

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
