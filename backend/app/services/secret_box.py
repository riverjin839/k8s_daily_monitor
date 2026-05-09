"""Symmetric encryption for credentials stored at rest.

Credentials are derived from the application ``secret_key`` via SHA-256 →
base64 — Fernet then provides authenticated encryption. Output ciphertext
is a URL-safe ASCII string and includes a key version marker (``v1:``) so
we can rotate keys later if needed.
"""
from __future__ import annotations

import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

_VERSION = "v1"


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: Optional[str]) -> Optional[str]:
    """Encrypt a string. Returns None for None/empty inputs."""
    if not plaintext:
        return None
    token = _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")
    return f"{_VERSION}:{token}"


def decrypt(ciphertext: Optional[str]) -> Optional[str]:
    """Decrypt a string. Returns None for None/empty inputs.

    Raises ValueError if the ciphertext is malformed or the key is wrong —
    callers should handle that case (treat the secret as unavailable).
    """
    if not ciphertext:
        return None
    if ":" in ciphertext:
        version, _, payload = ciphertext.partition(":")
        if version != _VERSION:
            raise ValueError(f"unsupported secret_box version: {version}")
    else:
        payload = ciphertext
    try:
        return _fernet().decrypt(payload.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:  # wrong key, tampered, etc.
        raise ValueError("decryption failed — secret_key may have changed") from exc
