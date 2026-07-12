"""HTTP tests for guardian-login provisioning.

Covers `POST /guardians/{id}/login` (the Guardian-tab trigger) and the
phone-aware `POST /users` path: the provision-whatever-they-have branch
(email invite / phone-OTP create / both), the neither-identifier 400,
one-login-per-guardian 409, staff-still-needs-email, and the admin-only
gate. Assertions read the FakeSupabaseAdminClient call records.
"""

from __future__ import annotations

from uuid import UUID

import inngest
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.users.model import User
from app.features.users.tests.conftest import (
    FakeSupabaseAdminClient,
    auth_header,
)


class _FakeSend:
    def __init__(self) -> None:
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        return ["evt_fake"]


G_EMAIL = UUID("70707070-7070-4707-8707-7070707009a1")
G_PHONE = UUID("70707070-7070-4707-8707-7070707009a2")
G_BOTH = UUID("70707070-7070-4707-8707-7070707009a3")
G_NEITHER = UUID("70707070-7070-4707-8707-7070707009a4")


async def _seed_guardian(
    session: AsyncSession,
    school_id: UUID,
    *,
    guardian_id: UUID,
    slug: str,
    email: str | None = None,
    phone: str | None = None,
) -> None:
    session.add(
        Guardian(
            id=guardian_id,
            slug=slug,
            school_id=school_id,
            first_name="Efua",
            last_name="Parent",
            email=email,
            phone=phone,
        )
    )
    await session.flush()


async def test_provision_email_guardian_sends_invite(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_EMAIL, slug="G-EM", email="em@example.com"
    )
    res = await client.post(f"/guardians/{G_EMAIL}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["role"] == "Parent"
    assert body["linkedId"] == str(G_EMAIL)
    assert body["mustChangePassword"] is True
    # Email → invite; no phone → update sets phone_confirm False.
    assert len(fake_supabase.invite_calls) == 1
    assert fake_supabase.invite_calls[0]["email"] == "em@example.com"
    assert len(fake_supabase.create_calls) == 0
    assert fake_supabase.update_calls[0]["phone_confirm"] is False
    assert fake_supabase.update_calls[0]["app_metadata"]["role"] == "Parent"


async def test_provision_phone_only_guardian_creates_otp_user(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_PHONE, slug="G-PH", phone="gl-phone-a"
    )
    res = await client.post(f"/guardians/{G_PHONE}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["mustChangePassword"] is False
    # Phone-only → create_user with confirmed phone, NO invite.
    assert len(fake_supabase.invite_calls) == 0
    assert len(fake_supabase.create_calls) == 1
    call = fake_supabase.create_calls[0]
    assert call["phone"] == "gl-phone-a"
    assert call["phone_confirm"] is True
    assert call["app_metadata"]["linked_id"] == str(G_PHONE)


async def test_provision_phone_only_emits_onboarding_sms(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_PHONE, slug="G-PH", phone="gl-phone-a"
    )
    res = await client.post(f"/guardians/{G_PHONE}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text

    assert len(fake_send.events) == 1
    event = fake_send.events[0]
    assert event.name == "sms/fanout.requested"
    assert event.data["category"] == "onboarding"
    assert event.data["recipients"] == [{"phone": "gl-phone-a", "guardian_id": str(G_PHONE)}]


async def test_provision_with_email_skips_onboarding_sms(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_EMAIL, slug="G-EM", email="em@example.com"
    )
    res = await client.post(f"/guardians/{G_EMAIL}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text
    assert fake_send.events == []


async def test_provision_both_invites_and_sets_phone(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    await _seed_guardian(
        db_session,
        seed_school.id,
        guardian_id=G_BOTH,
        slug="G-BO",
        email="both@example.com",
        phone="gl-phone-b",
    )
    res = await client.post(f"/guardians/{G_BOTH}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text
    assert len(fake_supabase.invite_calls) == 1
    assert fake_supabase.update_calls[0]["phone"] == "gl-phone-b"
    assert fake_supabase.update_calls[0]["phone_confirm"] is True


async def test_provision_neither_returns_400(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    await _seed_guardian(db_session, seed_school.id, guardian_id=G_NEITHER, slug="G-NO")
    res = await client.post(f"/guardians/{G_NEITHER}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 400
    assert fake_supabase.invite_calls == []
    assert fake_supabase.create_calls == []


async def test_second_login_for_guardian_conflicts(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_EMAIL, slug="G-EM", email="em@example.com"
    )
    first = await client.post(f"/guardians/{G_EMAIL}/login", headers=auth_header(role="Admin"))
    assert first.status_code == 201
    second = await client.post(f"/guardians/{G_EMAIL}/login", headers=auth_header(role="Admin"))
    assert second.status_code == 409


async def test_provision_requires_admin(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
) -> None:
    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_EMAIL, slug="G-EM", email="em@example.com"
    )
    res = await client.post(f"/guardians/{G_EMAIL}/login", headers=auth_header(role="Teacher"))
    assert res.status_code == 403


async def test_bridge_row_created_for_phone_only(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_PHONE, slug="G-PH", phone="gl-phone-c"
    )
    res = await client.post(f"/guardians/{G_PHONE}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 201
    row = (
        await db_session.execute(select(User).where(User.linked_id == G_PHONE))
    ).scalar_one_or_none()
    assert row is not None
    assert row.email is None
    assert row.role == "Parent"


# ─── POST /users phone path ──────────────────────────────────────────────────


async def test_users_create_parent_phone_only(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    await _seed_guardian(
        db_session, seed_school.id, guardian_id=G_PHONE, slug="G-PH", phone="gl-phone-d"
    )
    payload = {
        "displayName": "Efua Parent",
        "role": "Parent",
        "linkedId": str(G_PHONE),
        "phone": "gl-phone-d",
    }
    res = await client.post("/users", json=payload, headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text
    assert len(fake_supabase.create_calls) == 1
    assert fake_supabase.create_calls[0]["phone_confirm"] is True


async def test_users_create_staff_still_requires_email(
    client: AsyncClient,
    seed_school: School,
) -> None:
    payload = {"displayName": "No Email", "role": "Teacher", "phone": "gl-phone-x"}
    res = await client.post("/users", json=payload, headers=auth_header(role="Admin"))
    assert res.status_code == 422
