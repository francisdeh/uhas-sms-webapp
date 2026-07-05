"""Unit tests for the rate-limit key function.

Mirrors `test_security.py`'s style — mint tokens with the same secret
the runtime uses, then call `_rate_limit_key` directly against a
minimal Starlette `Request` built from a raw ASGI scope. No HTTP layer
involved; the end-to-end 429/exemption behavior is covered at the
router level (`app/features/exams/tests/test_report_card_pdf.py` for
the stricter per-route limit, `app/features/health/tests/test_health.py`
for the exemption).
"""

from __future__ import annotations

import time

import jwt
from starlette.requests import Request

from app.core.config import settings
from app.core.rate_limit import _rate_limit_key


def _mint(*, sub: str = "8f2c1c33-aaaa-bbbb-cccc-dddddddddddd", expires_in: int = 3600) -> str:
    now = int(time.time())
    payload = {"sub": sub, "iat": now, "exp": now + expires_in, "app_metadata": {}}
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def _request(*, authorization: str | None = None, client_host: str = "203.0.113.5") -> Request:
    headers = []
    if authorization is not None:
        headers.append((b"authorization", authorization.encode()))
    scope = {
        "type": "http",
        "headers": headers,
        "client": (client_host, 12345),
        "method": "GET",
        "path": "/",
    }
    return Request(scope)


def test_valid_bearer_token_keys_by_user_id() -> None:
    token = _mint(sub="user-123")
    request = _request(authorization=f"Bearer {token}")

    assert _rate_limit_key(request) == "user:user-123"


def test_missing_authorization_header_falls_back_to_ip() -> None:
    request = _request(authorization=None)

    assert _rate_limit_key(request) == "ip:203.0.113.5"


def test_malformed_authorization_header_falls_back_to_ip() -> None:
    """Not the 'Bearer <token>' shape at all — e.g. a bare token or a
    different auth scheme."""
    request = _request(authorization="NotBearer something")

    assert _rate_limit_key(request) == "ip:203.0.113.5"


def test_invalid_token_falls_back_to_ip() -> None:
    """A well-formed but unverifiable token (wrong signature) must not
    crash the key function — it's called on every request, including
    ones that will later 401 anyway."""
    token = jwt.encode(
        {"sub": "user-123", "exp": int(time.time()) + 3600},
        "wrong-secret-entirely-but-still-long-enough-for-hmac",
        algorithm="HS256",
    )
    request = _request(authorization=f"Bearer {token}")

    assert _rate_limit_key(request) == "ip:203.0.113.5"


def test_expired_token_falls_back_to_ip() -> None:
    token = _mint(expires_in=-60)
    request = _request(authorization=f"Bearer {token}")

    assert _rate_limit_key(request) == "ip:203.0.113.5"


def test_different_users_get_different_keys() -> None:
    key_a = _rate_limit_key(_request(authorization=f"Bearer {_mint(sub='user-a')}"))
    key_b = _rate_limit_key(_request(authorization=f"Bearer {_mint(sub='user-b')}"))

    assert key_a != key_b
