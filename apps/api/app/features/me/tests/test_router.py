"""Tests for `GET /me`.

Covers every resolution branch — Admin (linked staff), Teacher unit
head (populates division), Parent (guardian branch), and the email
fallback for a user without a linked row. Also asserts the 401/403
gates so a broken JWT can never reach the composition logic.
"""

from __future__ import annotations

from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.me.tests.conftest import (
    ADMIN_STAFF,
    ADMIN_USER,
    EMAIL_ONLY_USER,
    GUARDIAN_ID,
    PARENT_USER,
    TEACHER_STAFF,
    TEACHER_USER,
    FakeSupabaseAdminClient,
    auth_header,
)
from app.features.staff.model import Staff


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


# ─── PATCH /me ───────────────────────────────────────────────────────────────


async def test_patch_me_updates_staff_row_and_syncs_supabase(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        "/me",
        json={"displayName": "Kojo Newname", "phone": "0244000111"},
        headers=auth_header(),
    )
    assert res.status_code == 200, res.text
    assert res.json()["displayName"] == "Kojo Newname"

    staff = await db_session.scalar(select(Staff).where(Staff.id == ADMIN_STAFF))
    assert staff is not None
    assert staff.first_name == "Kojo"
    assert staff.last_name == "Newname"
    assert staff.phone == "0244000111"

    assert len(fake_supabase.update_calls) == 1
    assert fake_supabase.update_calls[0]["user_id"] == ADMIN_USER
    assert fake_supabase.update_calls[0]["user_metadata"] == {"display_name": "Kojo Newname"}


async def test_patch_me_updates_guardian_row_for_parent(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        "/me",
        json={"displayName": "Paa Newlast", "phone": "0244000222"},
        headers=auth_header(
            role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_ID, email="p@me.test"
        ),
    )
    assert res.status_code == 200, res.text

    guardian = await db_session.scalar(select(Guardian).where(Guardian.id == GUARDIAN_ID))
    assert guardian is not None
    assert guardian.first_name == "Paa"
    assert guardian.last_name == "Newlast"
    assert guardian.phone == "0244000222"


async def test_patch_me_partial_update_leaves_name_untouched(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch("/me", json={"phone": "0244000333"}, headers=auth_header())
    assert res.status_code == 200, res.text

    staff = await db_session.scalar(select(Staff).where(Staff.id == ADMIN_STAFF))
    assert staff is not None
    assert staff.first_name == "Adae"
    assert staff.last_name == "Admin"
    assert staff.phone == "0244000333"
    # No display_name in the payload → no Supabase sync call.
    assert fake_supabase.update_calls == []


async def test_patch_me_without_linked_id_returns_400(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        "/me",
        json={"displayName": "Nobody"},
        headers=auth_header(
            role="Admin",
            user_id=EMAIL_ONLY_USER,
            linked_id=None,
            email="fallback@me.test",
        ),
    )
    assert res.status_code == 400


async def test_patch_me_duplicate_guardian_phone_returns_409(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    other_guardian = Guardian(
        id=UUID("10101010-1010-4101-8101-101010100305"),
        slug="GUAR-other-me",
        school_id=UUID("10101010-1010-4101-8101-101010100001"),
        first_name="Kwesi",
        last_name="Other",
        email="other@me.test",
        phone="0244999999",
    )
    db_session.add(other_guardian)
    await db_session.flush()

    res = await client.patch(
        "/me",
        json={"phone": "0244999999"},
        headers=auth_header(
            role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_ID, email="p@me.test"
        ),
    )
    assert res.status_code == 409


async def test_patch_me_missing_auth_header_returns_401(client: AsyncClient, seed: None) -> None:
    res = await client.patch("/me", json={"displayName": "X"})
    assert res.status_code == 401
