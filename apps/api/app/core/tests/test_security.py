"""Unit tests for JWT verification.

Mint tokens with the same secret the runtime uses, then call
`verify_supabase_jwt` directly. No HTTP layer involved — those tests
live in `app/features/*/tests/`.
"""

from __future__ import annotations

import time

import jwt
import pytest

from app.core.config import settings
from app.core.errors import UnauthorizedError
from app.core.security import verify_supabase_jwt


def _mint(
    *,
    sub: str = "8f2c1c33-aaaa-bbbb-cccc-dddddddddddd",
    role: str | None = "Teacher",
    school_id: str | None = "school-uhas-001",
    linked_id: str | None = "STAFF-005",
    email: str | None = "teacher@uhas.edu.gh",
    phone: str | None = None,
    expires_in: int = 3600,
    secret: str | None = None,
) -> str:
    """Helper — produce a Supabase-shaped JWT for testing."""
    now = int(time.time())
    payload: dict[str, object] = {
        "sub": sub,
        "iat": now,
        "exp": now + expires_in,
        "aud": "authenticated",
        "email": email,
        "phone": phone,
        "app_metadata": {
            "role": role,
            "school_id": school_id,
            "linked_id": linked_id,
        },
    }
    return jwt.encode(payload, secret or settings.supabase_jwt_secret, algorithm="HS256")


def test_valid_token_yields_current_user() -> None:
    token = _mint()
    user = verify_supabase_jwt(token)

    assert user.user_id == "8f2c1c33-aaaa-bbbb-cccc-dddddddddddd"
    assert user.role == "Teacher"
    assert user.school_id == "school-uhas-001"
    assert user.linked_id == "STAFF-005"
    assert user.email == "teacher@uhas.edu.gh"
    assert user.phone is None


def test_phone_only_parent_token() -> None:
    """Parents may have phone only — verify both fields propagate."""
    token = _mint(
        role="Parent",
        linked_id="guardian-001",
        email=None,
        phone="+233200000001",
    )
    user = verify_supabase_jwt(token)

    assert user.role == "Parent"
    assert user.email is None
    assert user.phone == "+233200000001"


def test_expired_token_is_rejected() -> None:
    """Tokens past their `exp` raise UnauthorizedError."""
    token = _mint(expires_in=-60)  # already expired

    with pytest.raises(UnauthorizedError):
        verify_supabase_jwt(token)


def test_bad_signature_is_rejected() -> None:
    """A token signed with the wrong secret must not validate."""
    token = _mint(secret="not-the-right-secret-at-all-not-even-close")

    with pytest.raises(UnauthorizedError):
        verify_supabase_jwt(token)


def test_missing_sub_is_rejected() -> None:
    """JWT without a subject is invalid — Supabase always includes one."""
    now = int(time.time())
    token = jwt.encode(
        {"exp": now + 3600},  # no `sub`
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )

    with pytest.raises(UnauthorizedError):
        verify_supabase_jwt(token)


def test_role_in_user_metadata_is_ignored() -> None:
    """Trust only `app_metadata` for role — `user_metadata` is user-writable.

    If we ever accidentally read role from `user_metadata` it'd be a
    privilege-escalation hole. Lock the trust boundary now.
    """
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": "abc",
            "exp": now + 3600,
            # Attacker writes role here:
            "user_metadata": {"role": "Admin"},
            # No app_metadata at all
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )

    user = verify_supabase_jwt(token)
    assert user.role is None  # Admin claim from user_metadata MUST NOT leak through
