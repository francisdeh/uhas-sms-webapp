"""Service-level tests for StaffService — exercises invariants + audit
+ slug generation against a real transactional Postgres."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.features.audit.model import AuditLog
from app.features.schools.model import School
from app.features.staff.schema import (
    StaffCreate,
    StaffRoleChange,
    StaffUnitHeadToggle,
    StaffUpdate,
)
from app.features.staff.service import StaffService
from app.features.staff.tests.conftest import SCHOOL_UUID, USER_UUID


def _create_payload(
    *,
    email: str = "teacher.one@uhas.edu.gh",
    first_name: str = "Akua",
    last_name: str = "Mensah",
    system_role: str = "Teacher",
    division: str | None = "JHS",
) -> StaffCreate:
    return StaffCreate(
        first_name=first_name,
        last_name=last_name,
        rank="Senior Teacher",
        system_role=system_role,
        division=division,
        email=email,
        phone="+233241112233",
    )


async def test_create_assigns_first_slug(db_session: AsyncSession, seed_school: School) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    assert row.slug == "STAFF-001"
    assert row.is_active is True


async def test_create_increments_slug(db_session: AsyncSession, seed_school: School) -> None:
    await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="a@u.gh"))
    await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="b@u.gh"))
    third = await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="c@u.gh"))
    assert third.slug == "STAFF-003"


async def test_create_rejects_non_admin_without_division(
    db_session: AsyncSession, seed_school: School
) -> None:
    with pytest.raises(ValidationError):
        await StaffService.create(db_session, SCHOOL_UUID, _create_payload(division=None))


async def test_create_admin_does_not_need_division(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(
        db_session, SCHOOL_UUID, _create_payload(system_role="Admin", division=None)
    )
    assert row.system_role == "Admin"
    assert row.division is None


async def test_create_rejects_duplicate_email(
    db_session: AsyncSession, seed_school: School
) -> None:
    await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="dup@u.gh"))
    with pytest.raises(ConflictError):
        await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="dup@u.gh"))


async def test_update_only_touches_present_fields(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    updated = await StaffService.update(
        db_session, SCHOOL_UUID, row.id, StaffUpdate(phone="+233500000000")
    )
    assert updated.phone == "+233500000000"
    assert updated.first_name == row.first_name  # untouched


async def test_change_role_writes_audit_row(db_session: AsyncSession, seed_school: School) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    await StaffService.change_role(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffRoleChange(system_role="Admin"),
        actor_user_id=USER_UUID,
    )

    audit_rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "ROLE_CHANGE")))
        .scalars()
        .all()
    )
    assert len(audit_rows) == 1
    # `before` / `after` are JSONB (see migration 63bbd48d03f4) — they
    # come back as plain dicts.
    assert audit_rows[0].before == {"systemRole": "Teacher"}
    assert audit_rows[0].after == {"systemRole": "Admin"}


async def test_change_role_skips_audit_when_unchanged(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    await StaffService.change_role(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffRoleChange(system_role="Teacher", division="JHS"),
        actor_user_id=USER_UUID,
    )
    audit_count = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "ROLE_CHANGE")))
        .scalars()
        .all()
    )
    assert len(audit_count) == 0


async def test_change_role_to_admin_clears_division(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    updated = await StaffService.change_role(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffRoleChange(system_role="Admin"),
        actor_user_id=USER_UUID,
    )
    assert updated.division is None


async def test_toggle_unit_head_requires_teacher_role(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(
        db_session,
        SCHOOL_UUID,
        _create_payload(system_role="DeputyHead"),
    )
    with pytest.raises(ValidationError):
        await StaffService.toggle_unit_head(
            db_session,
            SCHOOL_UUID,
            row.id,
            StaffUnitHeadToggle(is_unit_head=True, unit_head_of="JHS"),
        )


async def test_toggle_unit_head_requires_unit_when_enabling(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    with pytest.raises(ValidationError):
        await StaffService.toggle_unit_head(
            db_session,
            SCHOOL_UUID,
            row.id,
            StaffUnitHeadToggle(is_unit_head=True),
        )


async def test_set_active_toggles(db_session: AsyncSession, seed_school: School) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    updated = await StaffService.set_active(db_session, SCHOOL_UUID, row.id, active=False)
    assert updated.is_active is False

    with pytest.raises(ConflictError):
        # Already inactive — second call should error.
        await StaffService.set_active(db_session, SCHOOL_UUID, row.id, active=False)


async def test_get_raises_not_found_for_missing_id(
    db_session: AsyncSession, seed_school: School
) -> None:
    from uuid import uuid4

    with pytest.raises(NotFoundError):
        await StaffService.get(db_session, SCHOOL_UUID, uuid4())
