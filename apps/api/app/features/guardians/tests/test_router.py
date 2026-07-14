"""HTTP-level tests for /guardians.

`POST /guardians` and `GET /guardians/{id}` were removed (dead code —
guardians are always created/fetched through the student-scoped
`POST/GET /students/{id}/guardians` flow, see
`students/tests/test_guardian_links.py` for create/dedup coverage).
Tests here that need an existing guardian row seed it directly via the
model, matching this file's own existing pattern for seeding `User` rows.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.guardians.tests.conftest import (
    OTHER_SCHOOL_UUID,
    SCHOOL_UUID,
    FakeSupabaseAdminClient,
    auth_header,
)
from app.features.schools.model import School
from app.features.users.model import User

_BODY = {
    "firstName": "Abena",
    "lastName": "Mensah",
    "email": "abena@example.com",
    "phone": "+233241112233",
}


async def _seed_guardian(
    db_session: AsyncSession,
    *,
    school_id: UUID = SCHOOL_UUID,
    slug: str = "GUARDIAN-001",
    first_name: str = "Abena",
    last_name: str = "Mensah",
    email: str | None = "abena@example.com",
    phone: str | None = "+233241112233",
) -> Guardian:
    guardian = Guardian(
        id=uuid4(),
        slug=slug,
        school_id=school_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
    )
    db_session.add(guardian)
    await db_session.flush()
    return guardian


async def test_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/guardians")
    assert res.status_code == 401


async def test_search_filters(
    client: AsyncClient, db_session: AsyncSession, seed_school: School
) -> None:
    await _seed_guardian(
        db_session, slug="GUARDIAN-001", last_name="Mensah", email="u0@x.gh", phone="+233241112200"
    )
    await _seed_guardian(
        db_session, slug="GUARDIAN-002", last_name="Boateng", email="u1@x.gh", phone="+233241112201"
    )

    res = await client.get("/guardians?q=boa", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["lastName"] == "Boateng"


async def test_cross_school_scoping(
    client: AsyncClient, db_session: AsyncSession, seed_school: School
) -> None:
    await _seed_guardian(db_session, school_id=SCHOOL_UUID)

    res = await client.get(
        "/guardians", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID)
    )
    assert res.status_code == 200
    assert res.json()["items"] == []


async def test_patch_updates_basic_fields(
    client: AsyncClient, db_session: AsyncSession, seed_school: School
) -> None:
    guardian = await _seed_guardian(db_session)

    res = await client.patch(
        f"/guardians/{guardian.id}",
        json={"firstName": "Akua"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["firstName"] == "Akua"


async def test_patch_requires_admin(
    client: AsyncClient, db_session: AsyncSession, seed_school: School
) -> None:
    guardian = await _seed_guardian(db_session)

    for role in ("Teacher", "Parent", "DeputyHead"):
        res = await client.patch(
            f"/guardians/{guardian.id}",
            json={"firstName": "Akua"},
            headers=auth_header(role=role),
        )
        assert res.status_code == 403


async def test_patch_phone_syncs_supabase_when_login_exists(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_school: School,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    guardian = await _seed_guardian(db_session)
    guardian_user_id = uuid4()
    db_session.add(
        User(
            id=guardian_user_id,
            school_id=SCHOOL_UUID,
            email=_BODY["email"],
            role="Parent",
            linked_id=guardian.id,
            is_active=True,
        )
    )
    await db_session.flush()

    res = await client.patch(
        f"/guardians/{guardian.id}",
        json={"phone": "0244000999"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["phone"] == "+233244000999"

    assert len(fake_supabase.update_calls) == 1
    call = fake_supabase.update_calls[0]
    assert str(call["user_id"]) == str(guardian_user_id)
    assert call["phone"] == "+233244000999"
    assert call["phone_confirm"] is True


async def test_patch_email_syncs_supabase_and_users_row_when_login_exists(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_school: School,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    guardian = await _seed_guardian(db_session)
    guardian_user_id = uuid4()
    db_session.add(
        User(
            id=guardian_user_id,
            school_id=SCHOOL_UUID,
            email=_BODY["email"],
            role="Parent",
            linked_id=guardian.id,
            is_active=True,
        )
    )
    await db_session.flush()

    res = await client.patch(
        f"/guardians/{guardian.id}",
        json={"email": "new-guardian@example.com"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["email"] == "new-guardian@example.com"

    assert len(fake_supabase.update_calls) == 1
    call = fake_supabase.update_calls[0]
    assert str(call["user_id"]) == str(guardian_user_id)
    assert call["email"] == "new-guardian@example.com"
    assert call["email_confirm"] is True

    user_row = await db_session.scalar(select(User).where(User.id == guardian_user_id))
    assert user_row is not None
    assert user_row.email == "new-guardian@example.com"


async def test_patch_phone_skips_supabase_when_no_login(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_school: School,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    guardian = await _seed_guardian(db_session)

    res = await client.patch(
        f"/guardians/{guardian.id}",
        json={"phone": "0244000999"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert fake_supabase.update_calls == []
