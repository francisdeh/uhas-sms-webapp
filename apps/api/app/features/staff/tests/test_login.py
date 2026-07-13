"""Tests for `POST /staff/{staff_id}/login` — mirrors
`users/tests/test_guardian_login.py`'s coverage shape for the staff
equivalent."""

from __future__ import annotations

from uuid import UUID

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.staff.tests.conftest import (
    SCHOOL_UUID,
    FakeSupabaseAdminClient,
    auth_header,
)

TEACHER_UUID = UUID("33333333-3333-4333-8333-333333333401")
NO_ROLE_UUID = UUID("33333333-3333-4333-8333-333333333402")

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def seed_teacher(db_session: AsyncSession, seed_school: School) -> Staff:
    staff = Staff(
        id=TEACHER_UUID,
        slug="STAFF-LOGIN-001",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Teacher",
        system_role="Teacher",
        email="ama-login@uhas.edu.gh",
        phone="+233200000401",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    return staff


@pytest_asyncio.fixture
async def seed_staff_no_role(db_session: AsyncSession, seed_school: School) -> Staff:
    staff = Staff(
        id=NO_ROLE_UUID,
        slug="STAFF-LOGIN-002",
        school_id=SCHOOL_UUID,
        first_name="No",
        last_name="Role",
        system_role=None,
        email="norole@uhas.edu.gh",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    return staff


async def test_admin_provisions_staff_login(
    client: AsyncClient,
    seed_teacher: Staff,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post(f"/staff/{TEACHER_UUID}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["role"] == "Teacher"
    assert body["linkedId"] == str(TEACHER_UUID)

    assert len(fake_supabase.generate_link_calls) == 1
    call = fake_supabase.generate_link_calls[0]
    assert call["type"] == "invite"
    assert call["email"] == "ama-login@uhas.edu.gh"

    assert len(fake_supabase.update_calls) == 1
    assert fake_supabase.update_calls[0]["phone"] == "+233200000401"


async def test_provisions_login_for_staff_with_no_role_fails(
    client: AsyncClient,
    seed_staff_no_role: Staff,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post(f"/staff/{NO_ROLE_UUID}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 400
    assert fake_supabase.generate_link_calls == []


async def test_provision_login_for_unknown_staff_404s(
    client: AsyncClient, seed_school: School
) -> None:
    res = await client.post(f"/staff/{UUID(int=999999)}/login", headers=auth_header(role="Admin"))
    assert res.status_code == 404


async def test_second_login_for_staff_conflicts(
    client: AsyncClient,
    seed_teacher: Staff,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    first = await client.post(f"/staff/{TEACHER_UUID}/login", headers=auth_header(role="Admin"))
    assert first.status_code == 201, first.text
    second = await client.post(f"/staff/{TEACHER_UUID}/login", headers=auth_header(role="Admin"))
    assert second.status_code == 409


async def test_non_admin_cannot_provision_staff_login(
    client: AsyncClient, seed_teacher: Staff
) -> None:
    res = await client.post(f"/staff/{TEACHER_UUID}/login", headers=auth_header(role="Teacher"))
    assert res.status_code == 403
