"""
Analyzer factory — selects backend based on ANALYZER_BACKEND env var.

Supported values: "claude" | "local_llm" | "rule_based"  (default: "rule_based")
"""

import os

from app.services.analyzers.base import BaseAnalyzer


def get_analyzer() -> BaseAnalyzer:
    backend = os.getenv("ANALYZER_BACKEND", "rule_based").lower().strip()

    if backend == "claude":
        from app.services.analyzers.claude_analyzer import ClaudeAnalyzer
        return ClaudeAnalyzer()

    if backend == "local_llm":
        from app.services.analyzers.local_llm_analyzer import LocalLLMAnalyzer
        return LocalLLMAnalyzer()

    from app.services.analyzers.rule_based_analyzer import RuleBasedAnalyzer
    return RuleBasedAnalyzer()
