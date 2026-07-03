"""HTTP-level tests for /users endpoints."""

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.users.model import User
from app.features.users.tests.conftest import (
    GUARDIAN_UUID_A,
    STAFF_UUID_A,
    STAFF_UUID_B,
    USER_UUID_1,
    USER_UUID_2,
    USER_UUID_3,
    FakeSupabaseAdminClient,
    auth_header,
)


async def _seed_staff(
    session: AsyncSession,
    school_id: UUID,
    *,
    staff_id: UUID,
    first: str,
    last: str,
    email: str,
) -> Staff:
    row = Staff(
        id=staff_id,
        slug=f"STAFF-{email.split('@')[0]}",
        school_id=school_id,
        first_name=first,
        last_name=last,
        system_role="Teacher",
        division="JHS",
        email=email,
        is_active=True,
    )
    session.add(row)
    await session.flush()
    return row


async def _seed_guardian(
    session: AsyncSession,
    school_id: UUID,
    *,
    guardian_id: UUID,
    first: str,
    last: str,
    email: str,
) -> Guardian:
    row = Guardian(
        id=guardian_id,
        slug=f"GUAR-{email.split('@')[0]}",
        school_id=school_id,
        first_name=first,
        last_name=last,
        email=email,
    )
    session.add(row)
    await session.flush()
    return row


async def _seed_user(
    session: AsyncSession,
    school_id: UUID,
    *,
    user_id: UUID,
    email: str,
    role: str,
    linked_id: UUID | None = None,
    is_active: bool = True,
    must_change: bool = True,
) -> User:
    row = User(
        id=user_id,
        school_id=school_id,
        email=email,
        role=role,
        linked_id=linked_id,
        is_active=is_active,
        must_change_password=must_change,
    )
    session.add(row)
    await session.flush()
    return row


@pytest.mark.anyio
async def test_missing_auth_returns_401(client: AsyncClient, seed_school: School) -> None:
    res = await client.get("/users")
    assert res.status_code == 401


@pytest.mark.anyio
async def test_non_admin_forbidden(client: AsyncClient, seed_school: School) -> None:
    for role in ("Teacher", "Parent", "DeputyHead", "Accountant"):
        res = await client.get("/users", headers=auth_header(role=role))
        assert res.status_code == 403, f"role={role}"


@pytest.mark.anyio
async def test_list_returns_paginated_results(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
) -> None:
    staff_a = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Alice",
        last="Anderson",
        email="alice@example.com",
    )
    staff_b = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_B,
        first="Bob",
        last="Brown",
        email="bob@example.com",
    )
    guardian_a = await _seed_guardian(
        db_session,
        seed_school.id,
        guardian_id=GUARDIAN_UUID_A,
        first="Carol",
        last="Chen",
        email="carol@example.com",
    )
    await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_1,
        email="alice@example.com",
        role="Teacher",
        linked_id=staff_a.id,
    )
    await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_2,
        email="bob@example.com",
        role="Teacher",
        linked_id=staff_b.id,
    )
    await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_3,
        email="carol@example.com",
        role="Parent",
        linked_id=guardian_a.id,
    )

    res = await client.get("/users", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["size"] == 20
    assert len(body["items"]) == 3
    emails = {item["email"] for item in body["items"]}
    assert emails == {"alice@example.com", "bob@example.com", "carol@example.com"}
    display_names = {item["displayName"] for item in body["items"]}
    assert "Alice Anderson" in display_names
    assert "Carol Chen" in display_names


@pytest.mark.anyio
async def test_list_filters_by_q_email(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
) -> None:
    staff_a = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Alice",
        last="Anderson",
        email="alice@example.com",
    )
    staff_b = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_B,
        first="Bob",
        last="Brown",
        email="bob@example.com",
    )
    await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_1,
        email="alice@example.com",
        role="Teacher",
        linked_id=staff_a.id,
    )
    await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_2,
        email="bob@example.com",
        role="Teacher",
        linked_id=staff_b.id,
    )

    res = await client.get("/users?q=alice", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["email"] == "alice@example.com"


@pytest.mark.anyio
async def test_list_filters_by_q_name(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
) -> None:
    staff_a = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Zoe",
        last="Zephyr",
        email="zz@example.com",
    )
    staff_b = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_B,
        first="Bob",
        last="Brown",
        email="bb@example.com",
    )
    await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_1,
        email="zz@example.com",
        role="Teacher",
        linked_id=staff_a.id,
    )
    await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_2,
        email="bb@example.com",
        role="Teacher",
        linked_id=staff_b.id,
    )

    res = await client.get("/users?q=Zeph", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["displayName"] == "Zoe Zephyr"


@pytest.mark.anyio
async def test_create_success_calls_supabase(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    staff = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Dan",
        last="Doe",
        email="dan@example.com",
    )
    fake_supabase.preset_ids(USER_UUID_1)

    payload = {
        "email": "dan@example.com",
        "displayName": "Dan Doe",
        "role": "Teacher",
        "linkedId": str(staff.id),
    }
    res = await client.post("/users", json=payload, headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["id"] == str(USER_UUID_1)
    assert body["email"] == "dan@example.com"
    assert body["role"] == "Teacher"
    assert body["linkedId"] == str(staff.id)
    assert body["displayName"] == "Dan Doe"
    assert body["isActive"] is True
    assert body["mustChangePassword"] is True

    assert len(fake_supabase.create_calls) == 1
    call = fake_supabase.create_calls[0]
    assert call["email"] == "dan@example.com"
    assert call["app_metadata"]["role"] == "Teacher"
    assert call["app_metadata"]["school_id"] == str(seed_school.id)
    assert call["app_metadata"]["linked_id"] == str(staff.id)
    assert call["user_metadata"]["display_name"] == "Dan Doe"
    assert call["user_metadata"]["must_change_password"] is True


@pytest.mark.anyio
async def test_create_parent_with_staff_link_returns_400(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    staff = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Ed",
        last="Evans",
        email="ed@example.com",
    )
    payload = {
        "email": "parent@example.com",
        "displayName": "Not A Guardian",
        "role": "Parent",
        "linkedId": str(staff.id),
    }
    res = await client.post("/users", json=payload, headers=auth_header(role="Admin"))
    assert res.status_code == 400
    assert fake_supabase.create_calls == []


@pytest.mark.anyio
async def test_create_teacher_with_guardian_link_returns_400(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    guardian = await _seed_guardian(
        db_session,
        seed_school.id,
        guardian_id=GUARDIAN_UUID_A,
        first="Fay",
        last="Ford",
        email="fay@example.com",
    )
    payload = {
        "email": "teach@example.com",
        "displayName": "Not A Staff",
        "role": "Teacher",
        "linkedId": str(guardian.id),
    }
    res = await client.post("/users", json=payload, headers=auth_header(role="Admin"))
    assert res.status_code == 400
    assert fake_supabase.create_calls == []


@pytest.mark.anyio
async def test_deactivate_flips_is_active(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    staff = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Guy",
        last="Green",
        email="guy@example.com",
    )
    row = await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_1,
        email="guy@example.com",
        role="Teacher",
        linked_id=staff.id,
    )

    res = await client.post(
        f"/users/{row.id}/deactivate",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["isActive"] is False

    await db_session.refresh(row)
    assert row.is_active is False

    assert len(fake_supabase.update_calls) == 1
    call = fake_supabase.update_calls[0]
    assert str(call["user_id"]) == str(row.id)
    assert call["ban_duration"] == "876600h"


@pytest.mark.anyio
async def test_activate_flips_is_active_true(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    staff = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Hal",
        last="Hart",
        email="hal@example.com",
    )
    row = await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_1,
        email="hal@example.com",
        role="Teacher",
        linked_id=staff.id,
        is_active=False,
    )

    res = await client.post(
        f"/users/{row.id}/activate",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["isActive"] is True

    await db_session.refresh(row)
    assert row.is_active is True

    call = fake_supabase.update_calls[0]
    assert call["ban_duration"] == "none"


@pytest.mark.anyio
async def test_patch_email(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    staff = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Ivy",
        last="Isley",
        email="ivy@example.com",
    )
    row = await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_1,
        email="ivy@example.com",
        role="Teacher",
        linked_id=staff.id,
    )

    res = await client.patch(
        f"/users/{row.id}",
        json={"email": "ivy.new@example.com"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["email"] == "ivy.new@example.com"

    await db_session.refresh(row)
    assert row.email == "ivy.new@example.com"

    assert len(fake_supabase.update_calls) == 1
    assert fake_supabase.update_calls[0]["email"] == "ivy.new@example.com"


@pytest.mark.anyio
async def test_patch_display_name_updates_linked_staff(
    client: AsyncClient,
    seed_school: School,
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    staff = await _seed_staff(
        db_session,
        seed_school.id,
        staff_id=STAFF_UUID_A,
        first="Jane",
        last="Old",
        email="jane@example.com",
    )
    row = await _seed_user(
        db_session,
        seed_school.id,
        user_id=USER_UUID_1,
        email="jane@example.com",
        role="Teacher",
        linked_id=staff.id,
    )

    res = await client.patch(
        f"/users/{row.id}",
        json={"displayName": "Jane New"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["displayName"] == "Jane New"

    await db_session.refresh(staff)
    assert staff.first_name == "Jane"
    assert staff.last_name == "New"


@pytest.mark.anyio
async def test_patch_missing_user_returns_404(
    client: AsyncClient,
    seed_school: School,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        f"/users/{USER_UUID_1}",
        json={"email": "ghost@example.com"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 404
    assert fake_supabase.update_calls == []
