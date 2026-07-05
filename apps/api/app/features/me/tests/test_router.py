"""Tests for `GET /me`.

Covers every resolution branch — Admin (linked staff), Teacher unit
head (populates division), Parent (guardian branch), and the email
fallback for a user without a linked row. Also asserts the 401/403
gates so a broken JWT can never reach the composition logic.
"""

from __future__ import annotations

from httpx import AsyncClient

from app.features.me.tests.conftest import (
    ADMIN_STAFF,
    ADMIN_USER,
    EMAIL_ONLY_USER,
    GUARDIAN_ID,
    PARENT_USER,
    TEACHER_STAFF,
    TEACHER_USER,
    auth_header,
)


async def test_get_me_admin_linked_staff(client: AsyncClient, seed: None) -> None:
    r = await client.get("/me", headers=auth_header())
    assert r.status_code == 200
    body = r.json()
    assert body["uid"] == str(ADMIN_USER)
    assert body["role"] == "Admin"
    assert body["linkedId"] == str(ADMIN_STAFF)
    assert body["slug"] == "STAFF-adm-me"
    assert body["displayName"] == "Adae Admin"
    assert body["email"] == "admin@me.test"
    assert body["isActive"] is True
    assert body["isUnitHead"] is False
    assert body["unitHeadOf"] is None
    assert body["mustChangePassword"] is False


async def test_get_me_teacher_unit_head(client: AsyncClient, seed: None) -> None:
    r = await client.get(
        "/me",
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_USER,
            linked_id=TEACHER_STAFF,
            email="t@me.test",
        ),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "Teacher"
    assert body["slug"] == "STAFF-t-me"
    assert body["displayName"] == "Ama Teacher"
    assert body["isUnitHead"] is True
    assert body["unitHeadOf"] == "JHS"


async def test_get_me_parent_linked_guardian(client: AsyncClient, seed: None) -> None:
    r = await client.get(
        "/me",
        headers=auth_header(
            role="Parent",
            user_id=PARENT_USER,
            linked_id=GUARDIAN_ID,
            email="p@me.test",
        ),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "Parent"
    assert body["linkedId"] == str(GUARDIAN_ID)
    assert body["slug"] == "GUAR-p-me"
    assert body["displayName"] == "Paa Parent"
    # Parents never get unit-head fields — even if the branch runs.
    assert body["isUnitHead"] is False


async def test_get_me_email_fallback_when_no_linked_row(client: AsyncClient, seed: None) -> None:
    r = await client.get(
        "/me",
        headers=auth_header(
            role="Admin",
            user_id=EMAIL_ONLY_USER,
            linked_id=None,
            email="fallback@me.test",
            must_change_password=True,
        ),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["linkedId"] is None
    assert body["slug"] is None
    # No linked staff → fall through to the JWT email.
    assert body["displayName"] == "fallback@me.test"
    assert body["mustChangePassword"] is True


async def test_get_me_missing_auth_header_returns_401(client: AsyncClient, seed: None) -> None:
    r = await client.get("/me")
    assert r.status_code == 401


async def test_get_me_jwt_without_role_is_forbidden(client: AsyncClient, seed: None) -> None:
    # Empty role field slips past the JWT verify but the service
    # rejects it — a half-provisioned account has no dashboard yet.
    import time
    from uuid import UUID

    import jwt

    from app.core.config import settings

    now = int(time.time())
    token = jwt.encode(
        {
            "sub": str(UUID(int=0)),
            "iat": now,
            "exp": now + 3600,
            "email": "half@me.test",
            "app_metadata": {},
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    r = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
