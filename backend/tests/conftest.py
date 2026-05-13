"""
Shared pytest configuration and fixtures.

Stubs out optional/heavy third-party modules that are not installed in the
current test environment so that collection of pure-unit tests (e.g.
test_csv_glob.py) works without requiring the full production dependency set.
"""
import os
import sys
import types


def _make_stub(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


# ── Stub modules that are not pip-installable in this env ─────────────────

for _missing in ("feedparser", "jose"):
    if _missing not in sys.modules:
        _make_stub(_missing)

# jose sub-modules referenced by app.auth.security
for _sub in ("jose.jwt", "jose.JWTError"):
    pkg, _, _ = _sub.partition(".")
    if _sub not in sys.modules:
        _stub = _make_stub(_sub)
        # expose JWTError as a class so `from jose import JWTError` works
        if _sub == "jose.JWTError":
            pass  # handled below

# Make `from jose import jwt, JWTError` importable
_jose = sys.modules.get("jose") or _make_stub("jose")
if not hasattr(_jose, "jwt"):
    _jose.jwt = _make_stub("jose.jwt")  # type: ignore[attr-defined]
if not hasattr(_jose, "JWTError"):
    _jose.JWTError = Exception  # type: ignore[attr-defined]


# ── Standard env-vars required by app.config / SQLAlchemy engine init ──────

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/k8s_monitor_test",
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6379/0")
os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
