"""HTTP-level tests for /guardians."""

from __future__ import annotations

from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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


async def test_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/guardians")
    assert res.status_code == 401


async def test_create_requires_admin(client: AsyncClient, seed_school: School) -> None:
    for role in ("Teacher", "Parent", "DeputyHead"):
        res = await client.post("/guardians", json=_BODY, headers=auth_header(role=role))
        assert res.status_code == 403


async def test_create_round_trips(client: AsyncClient, seed_school: School) -> None:
    res = await client.post("/guardians", json=_BODY, headers=auth_header(role="Admin"))
    assert res.status_code == 201
    body = res.json()
    assert body["slug"] == "GUARDIAN-001"
    assert body["firstName"] == "Abena"

    listed = await client.get("/guardians", headers=auth_header(role="Admin"))
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1


async def test_create_rejects_missing_both_identifiers(
    client: AsyncClient, seed_school: School
) -> None:
    bad = {"firstName": "X", "lastName": "Y"}
    res = await client.post("/guardians", json=bad, headers=auth_header(role="Admin"))
    assert res.status_code == 422  # Pydantic model_validator


async def test_create_409_on_duplicate_email(client: AsyncClient, seed_school: School) -> None:
    await client.post("/guardians", json=_BODY, headers=auth_header(role="Admin"))
    res = await client.post(
        "/guardians",
        json={**_BODY, "phone": "+233500000000"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 409


async def test_create_409_on_duplicate_phone(client: AsyncClient, seed_school: School) -> None:
    await client.post("/guardians", json=_BODY, headers=auth_header(role="Admin"))
    res = await client.post(
        "/guardians",
        json={**_BODY, "email": "other@example.com"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 409


async def test_search_filters(client: AsyncClient, seed_school: School) -> None:
    for i, last in enumerate(["Mensah", "Boateng"]):
        await client.post(
            "/guardians",
            json={**_BODY, "lastName": last, "email": f"u{i}@x.gh", "phone": f"+23324111220{i}"},
            headers=auth_header(role="Admin"),
        )
    res = await client.get("/guardians?q=boa", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["lastName"] == "Boateng"


async def test_cross_school_scoping(client: AsyncClient, seed_school: School) -> None:
    await client.post(
        "/guardians",
        json=_BODY,
        headers=auth_header(role="Admin", school_id=SCHOOL_UUID),
    )
    res = await client.get(
        "/guardians", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID)
    )
    assert res.status_code == 200
    assert res.json()["items"] == []


async def test_patch_updates_basic_fields(client: AsyncClient, seed_school: School) -> None:
    created = (
        await client.post("/guardians", json=_BODY, headers=auth_header(role="Admin"))
    ).json()
    res = await client.patch(
        f"/guardians/{created['id']}",
        json={"firstName": "Akua"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["firstName"] == "Akua"


async def test_patch_phone_syncs_supabase_when_login_exists(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_school: School,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    created = (
        await client.post("/guardians", json=_BODY, headers=auth_header(role="Admin"))
    ).json()
    guardian_user_id = uuid4()
    db_session.add(
        User(
            id=guardian_user_id,
            school_id=SCHOOL_UUID,
            email=_BODY["email"],
            role="Parent",
            linked_id=created["id"],
            is_active=True,
        )
    )
    await db_session.flush()

    res = await client.patch(
        f"/guardians/{created['id']}",
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
    created = (
        await client.post("/guardians", json=_BODY, headers=auth_header(role="Admin"))
    ).json()
    guardian_user_id = uuid4()
    db_session.add(
        User(
            id=guardian_user_id,
            school_id=SCHOOL_UUID,
            email=_BODY["email"],
            role="Parent",
            linked_id=created["id"],
            is_active=True,
        )
    )
    await db_session.flush()

    res = await client.patch(
        f"/guardians/{created['id']}",
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
    client: AsyncClient, seed_school: School, fake_supabase: FakeSupabaseAdminClient
) -> None:
    created = (
        await client.post("/guardians", json=_BODY, headers=auth_header(role="Admin"))
    ).json()
    res = await client.patch(
        f"/guardians/{created['id']}",
        json={"phone": "0244000999"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert fake_supabase.update_calls == []
