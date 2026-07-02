"""Audience resolver tests — one per shape + dedupe/inactive filtering.

Runs against the real DB so we exercise the same joins production uses.
The `seed_full` fixture is the shared graph — see conftest for shape.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.notifications.audience import (
    AllAdminsAudience,
    AllParentsAudience,
    AllTeachersAudience,
    ParentsInDivisionAudience,
    ParentsOfClassAudience,
    ParentsOfStudentsAudience,
    SchoolWideAudience,
    StaffAudience,
    StaffByDivisionAudience,
    UnitHeadOfDivisionAudience,
    UserAudience,
    UsersAudience,
    resolve_audience,
)
from app.features.notifications.tests.conftest import (
    ADMIN_USER,
    CLASS_JHS1_UUID,
    CLASS_KG1_UUID,
    DEPUTY_JHS_USER,
    INACTIVE_USER,
    PARENT_USER,
    SCHOOL_UUID,
    STUDENT_UUID,
    TEACHER_STAFF,
    TEACHER_USER,
    UNIT_HEAD_USER,
)

pytestmark = pytest.mark.asyncio

YEAR = "2025/2026"


async def test_user_audience_single(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session, SCHOOL_UUID, UserAudience(user_id=ADMIN_USER), academic_year=YEAR
    )
    assert result == [ADMIN_USER]


async def test_users_audience_dedupes(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        UsersAudience(user_ids=[ADMIN_USER, ADMIN_USER, TEACHER_USER]),
        academic_year=YEAR,
    )
    assert set(result) == {ADMIN_USER, TEACHER_USER}
    assert len(result) == 2


async def test_users_audience_drops_inactive(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        UsersAudience(user_ids=[TEACHER_USER, INACTIVE_USER]),
        academic_year=YEAR,
    )
    assert set(result) == {TEACHER_USER}


async def test_staff_audience(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        StaffAudience(staff_id=TEACHER_STAFF),
        academic_year=YEAR,
    )
    assert result == [TEACHER_USER]


async def test_staff_by_division_all(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    """Every staff row in the division with an active user."""
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        StaffByDivisionAudience(division="JHS"),
        academic_year=YEAR,
    )
    # JHS has: Deputy, Unit Head, Teacher (active users); Inactive user
    # is filtered.
    assert set(result) == {DEPUTY_JHS_USER, UNIT_HEAD_USER, TEACHER_USER}


async def test_staff_by_division_role_filter(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    """Passing `roles=["DeputyHead"]` narrows to just DH."""
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        StaffByDivisionAudience(division="JHS", roles=["DeputyHead"]),
        academic_year=YEAR,
    )
    assert result == [DEPUTY_JHS_USER]


async def test_unit_head_of_division(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        UnitHeadOfDivisionAudience(division="JHS"),
        academic_year=YEAR,
    )
    assert result == [UNIT_HEAD_USER]


async def test_unit_head_of_division_no_match(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    """KG has no unit head in the seed → empty audience → no error."""
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        UnitHeadOfDivisionAudience(division="KG"),
        academic_year=YEAR,
    )
    assert result == []


async def test_all_teachers(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session, SCHOOL_UUID, AllTeachersAudience(), academic_year=YEAR
    )
    # Two active Teacher users (unit head + teacher). Inactive dropped.
    assert set(result) == {UNIT_HEAD_USER, TEACHER_USER}


async def test_all_admins(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session, SCHOOL_UUID, AllAdminsAudience(), academic_year=YEAR
    )
    assert result == [ADMIN_USER]


async def test_parents_of_students(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        ParentsOfStudentsAudience(student_ids=[STUDENT_UUID]),
        academic_year=YEAR,
    )
    assert result == [PARENT_USER]


async def test_parents_of_class(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    """One active enrollment in JHS 1 (the seeded student) → their
    parent gets notified."""
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        ParentsOfClassAudience(class_id=CLASS_JHS1_UUID),
        academic_year=YEAR,
    )
    assert result == [PARENT_USER]


async def test_parents_of_class_empty(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        ParentsOfClassAudience(class_id=CLASS_KG1_UUID),
        academic_year=YEAR,
    )
    assert result == []


async def test_parents_in_division(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session,
        SCHOOL_UUID,
        ParentsInDivisionAudience(division="JHS"),
        academic_year=YEAR,
    )
    assert result == [PARENT_USER]


async def test_all_parents(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    _ = seed_full
    result = await resolve_audience(
        db_session, SCHOOL_UUID, AllParentsAudience(), academic_year=YEAR
    )
    assert result == [PARENT_USER]


async def test_school_wide(db_session: AsyncSession, seed_full: dict[str, object]) -> None:
    """School-wide: every active user in the school."""
    _ = seed_full
    result = await resolve_audience(
        db_session, SCHOOL_UUID, SchoolWideAudience(), academic_year=YEAR
    )
    assert set(result) == {
        ADMIN_USER,
        DEPUTY_JHS_USER,
        UNIT_HEAD_USER,
        TEACHER_USER,
        PARENT_USER,
    }
    # Inactive stays out.
    assert INACTIVE_USER not in result
