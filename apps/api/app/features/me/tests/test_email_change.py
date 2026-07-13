"""Tests for `POST /me/email/request-change` — replaces the frontend's
direct `supabase.auth.updateUser({email})` call with a server-mediated
dual-confirmation flow through our own branded system."""

from __future__ import annotations

from uuid import UUID

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.me.tests.conftest import (
    GUARDIAN_ID,
    PARENT_USER,
    TEACHER_STAFF,
    TEACHER_USER,
    FakeSupabaseAdminClient,
    auth_header,
)
from app.features.users.model import User

PHONE_ONLY_USER = UUID("10101010-1010-4101-8101-101010100405")
SAME_EMAIL_USER = UUID("10101010-1010-4101-8101-101010100406")

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def seed_phone_only(db_session: AsyncSession, seed: None) -> User:
    _ = seed
    from app.features.me.tests.conftest import SCHOOL_UUID

    user = User(
        id=PHONE_ONLY_USER,
        school_id=SCHOOL_UUID,
        email=None,
        role="Parent",
        linked_id=GUARDIAN_ID,
        is_active=True,
        must_change_password=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def seed_same_email_user(db_session: AsyncSession, seed: None) -> User:
    """A user with a normal-domain email (`.test` fixture emails fail
    `EmailStr` validation on the request body, so the same-email guard
    needs its own dedicated address to round-trip through the schema)."""
    _ = seed
    from app.features.me.tests.conftest import SCHOOL_UUID

    user = User(
        id=SAME_EMAIL_USER,
        school_id=SCHOOL_UUID,
        email="same@example.com",
        role="Parent",
        linked_id=GUARDIAN_ID,
        is_active=True,
        must_change_password=False,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def test_teacher_requests_email_change(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    _ = seed
    res = await client.post(
        "/me/email/request-change",
        json={"newEmail": "new-teacher@example.com"},
        headers=auth_header(
            role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF, email="t@me.test"
        ),
    )
    assert res.status_code == 202, res.text

    assert len(fake_supabase.generate_link_calls) == 2
    types = {call["type"] for call in fake_supabase.generate_link_calls}
    assert types == {"email_change_current", "email_change_new"}
    for call in fake_supabase.generate_link_calls:
        assert call["email"] == "t@me.test"
        assert call["new_email"] == "new-teacher@example.com"
        assert "/teacher/profile?tab=security" in call["redirect_to"]


async def test_parent_requests_email_change_uses_parent_redirect(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    _ = seed
    res = await client.post(
        "/me/email/request-change",
        json={"newEmail": "new-parent@example.com"},
        headers=auth_header(
            role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_ID, email="p@me.test"
        ),
    )
    assert res.status_code == 202, res.text
    for call in fake_supabase.generate_link_calls:
        assert "/parent/profile?tab=security" in call["redirect_to"]


async def test_same_email_rejected(
    client: AsyncClient,
    seed_same_email_user: User,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post(
        "/me/email/request-change",
        json={"newEmail": "same@example.com"},
        headers=auth_header(
            role="Parent",
            user_id=SAME_EMAIL_USER,
            linked_id=GUARDIAN_ID,
            email="same@example.com",
        ),
    )
    assert res.status_code == 400
    assert fake_supabase.generate_link_calls == []


async def test_phone_only_account_cannot_request_change(
    client: AsyncClient,
    seed_phone_only: User,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post(
        "/me/email/request-change",
        json={"newEmail": "first-email@example.com"},
        headers=auth_header(
            role="Parent", user_id=PHONE_ONLY_USER, linked_id=GUARDIAN_ID, email=""
        ),
    )
    assert res.status_code == 400
    assert fake_supabase.generate_link_calls == []
