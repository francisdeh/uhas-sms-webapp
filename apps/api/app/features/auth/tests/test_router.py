"""Tests for `POST /auth/reset-password` — the enumeration-safe guard
is the load-bearing behavior here: every branch (unknown email,
cooldown active, Supabase itself reporting no such user) must return
the identical 204 with no observable difference."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import PASSWORD_RESET_LIMIT
from app.features.auth.tests.conftest import FakeSupabaseAdminClient
from app.features.schools.model import School
from app.features.users.model import User

pytestmark = pytest.mark.asyncio


async def test_known_email_sends_reset_email(
    client: AsyncClient,
    seed_user: User,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post("/auth/reset-password", json={"email": "staff@auth-suite.example.com"})
    assert res.status_code == 204

    assert len(fake_supabase.generate_link_calls) == 1
    call = fake_supabase.generate_link_calls[0]
    assert call["type"] == "recovery"
    assert call["email"] == "staff@auth-suite.example.com"


async def test_unknown_email_still_returns_204_and_sends_nothing(
    client: AsyncClient,
    seed_school: School,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post("/auth/reset-password", json={"email": "nobody@example.com"})
    assert res.status_code == 204
    assert fake_supabase.generate_link_calls == []


async def test_supabase_reporting_unknown_user_still_returns_204(
    client: AsyncClient,
    seed_user: User,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    """Our bridge row exists but Supabase itself has no matching auth
    user — an inconsistent-but-possible edge case. Must stay silent."""
    fake_supabase.unknown_emails.add("staff@auth-suite.example.com")
    res = await client.post("/auth/reset-password", json={"email": "staff@auth-suite.example.com"})
    assert res.status_code == 204
    assert fake_supabase.generate_link_calls == []


async def test_cooldown_skips_resend(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_user: User,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    seed_user.last_password_reset_sent_at = datetime.now(UTC).replace(tzinfo=None)
    await db_session.flush()

    res = await client.post("/auth/reset-password", json={"email": "staff@auth-suite.example.com"})
    assert res.status_code == 204
    assert fake_supabase.generate_link_calls == []


async def test_cooldown_expired_allows_resend(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_user: User,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:

    seed_user.last_password_reset_sent_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(
        minutes=10
    )
    await db_session.flush()

    res = await client.post("/auth/reset-password", json={"email": "staff@auth-suite.example.com"})
    assert res.status_code == 204
    assert len(fake_supabase.generate_link_calls) == 1


async def test_stamps_cooldown_after_sending(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_user: User,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post("/auth/reset-password", json={"email": "staff@auth-suite.example.com"})
    assert res.status_code == 204

    refreshed = await db_session.scalar(select(User).where(User.id == seed_user.id))
    assert refreshed is not None
    assert refreshed.last_password_reset_sent_at is not None


async def test_exceeding_rate_limit_returns_429(
    client: AsyncClient,
    seed_school: School,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    limit = int(PASSWORD_RESET_LIMIT.split("/")[0])
    for _ in range(limit):
        res = await client.post("/auth/reset-password", json={"email": "nobody@example.com"})
        assert res.status_code == 204

    res = await client.post("/auth/reset-password", json={"email": "nobody@example.com"})
    assert res.status_code == 429
