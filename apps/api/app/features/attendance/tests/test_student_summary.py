"""HTTP-level tests for the parent-facing student attendance endpoints.

Covers `/students/{id}/attendance-summary` and
`/students/{id}/attendance-calendar` — the role matrix (Admin, Parent,
Teacher, DeputyHead), the "calendar omits days without a session" rule,
and the missing-auth 401.

Seeds sit in the `40404040-4040-4404-8404-…` range to avoid clashing
with the module conftest's `99…` range when the full suite runs in one
transaction.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.attendance.tests.conftest import (
    CLASS_UUID,
    SCHOOL_UUID,
    STAFF_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    auth_header,
)
from app.features.classes.model import Class, ClassTeacher
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.main import app  # noqa: F401 — kept to force router registration

GUARDIAN_UUID = UUID("40404040-4040-4404-8404-040404040401")
OTHER_GUARDIAN_UUID = UUID("40404040-4040-4404-8404-040404040402")

ADMIN_STAFF_UUID = UUID("40404040-4040-4404-8404-040404040501")
DEPUTY_JHS_UUID = UUID("40404040-4040-4404-8404-040404040502")
DEPUTY_LP_UUID = UUID("40404040-4040-4404-8404-040404040503")
OTHER_TEACHER_UUID = UUID("40404040-4040-4404-8404-040404040504")

TERM_START = "2026-01-05"
TERM_END = "2026-01-30"


@pytest_asyncio.fixture
async def seed_extra_actors(
    db_session: AsyncSession,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    """Guardians + Admin/Deputy/other-teacher staff + class-teacher link."""
    parent = Guardian(
        id=GUARDIAN_UUID,
        slug="GRD-ATT-001",
        school_id=SCHOOL_UUID,
        first_name="Efua",
        last_name="Parent",
        email="efua.attsum@example.com",
    )
    unrelated = Guardian(
        id=OTHER_GUARDIAN_UUID,
        slug="GRD-ATT-002",
        school_id=SCHOOL_UUID,
        first_name="Kwame",
        last_name="Stranger",
        email="kwame.attsum@example.com",
    )
    admin = Staff(
        id=ADMIN_STAFF_UUID,
        slug="STAFF-ATT-ADM",
        school_id=SCHOOL_UUID,
        first_name="Nana",
        last_name="Admin",
        system_role="Admin",
        email="admin.attsum@uhas.edu.gh",
        is_active=True,
    )
    deputy_jhs = Staff(
        id=DEPUTY_JHS_UUID,
        slug="STAFF-ATT-DPJ",
        school_id=SCHOOL_UUID,
        first_name="Yaa",
        last_name="DeputyJHS",
        system_role="DeputyHead",
        division="JHS",
        email="dpjhs.attsum@uhas.edu.gh",
        is_active=True,
    )
    deputy_lp = Staff(
        id=DEPUTY_LP_UUID,
        slug="STAFF-ATT-DPL",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="DeputyLP",
        system_role="DeputyHead",
        division="Lower Primary",
        email="dplp.attsum@uhas.edu.gh",
        is_active=True,
    )
    other_teacher = Staff(
        id=OTHER_TEACHER_UUID,
        slug="STAFF-ATT-OTH",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="OtherTeacher",
        system_role="Teacher",
        division="JHS",
        email="oth.attsum@uhas.edu.gh",
        rank="Teacher",
        is_active=True,
    )
    db_session.add_all([parent, unrelated, admin, deputy_jhs, deputy_lp, other_teacher])
    await db_session.flush()

    db_session.add_all(
        [
            StudentGuardian(
                student_id=STUDENT_A_UUID,
                guardian_id=GUARDIAN_UUID,
                relation="mother",
                is_primary=True,
            ),
            ClassTeacher(
                class_id=CLASS_UUID,
                staff_id=STAFF_UUID,
                is_primary=True,
            ),
        ]
    )
    await db_session.flush()


async def _seed_sessions(
    db_session: AsyncSession,
    *,
    dates_and_statuses: list[tuple[date, str]],
) -> None:
    """Create one attendance session per date with a record for STUDENT_A."""
    for d, status in dates_and_statuses:
        sess = AttendanceSession(
            school_id=SCHOOL_UUID,
            class_id=CLASS_UUID,
            date=d,
            term=2,
            submitted_by_id=STAFF_UUID,
        )
        db_session.add(sess)
        await db_session.flush()
        db_session.add(
            AttendanceRecord(
                session_id=sess.id,
                student_id=STUDENT_A_UUID,
                status=status,
            )
        )
    await db_session.flush()


def _summary_url(student_id: UUID) -> str:
    return f"/students/{student_id}/attendance-summary?termStart={TERM_START}&termEnd={TERM_END}"


def _calendar_url(student_id: UUID) -> str:
    return f"/students/{student_id}/attendance-calendar?termStart={TERM_START}&termEnd={TERM_END}"


async def test_missing_auth_returns_401(client: AsyncClient) -> None:
    res = await client.get(_summary_url(STUDENT_A_UUID))
    assert res.status_code == 401


async def test_admin_can_view_any_student_summary(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_extra_actors: None,
) -> None:
    await _seed_sessions(
        db_session,
        dates_and_statuses=[
            (date(2026, 1, 12), "Present"),
            (date(2026, 1, 13), "Absent"),
            (date(2026, 1, 14), "Late"),
        ],
    )
    res = await client.get(
        _summary_url(STUDENT_A_UUID),
        headers=auth_header(role="Admin", linked_id=ADMIN_STAFF_UUID),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body == {
        "presentCount": 1,
        "absentCount": 1,
        "lateCount": 1,
        "excusedCount": 0,
        "totalDays": 3,
    }


async def test_parent_can_view_own_child_summary(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_extra_actors: None,
) -> None:
    await _seed_sessions(
        db_session,
        dates_and_statuses=[
            (date(2026, 1, 12), "Present"),
            (date(2026, 1, 13), "Excused"),
        ],
    )
    res = await client.get(
        _summary_url(STUDENT_A_UUID),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["presentCount"] == 1
    assert body["excusedCount"] == 1
    assert body["totalDays"] == 2


async def test_parent_cannot_view_unrelated_student(
    client: AsyncClient,
    seed_extra_actors: None,
) -> None:
    res = await client.get(
        _summary_url(STUDENT_B_UUID),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 403


async def test_teacher_can_view_own_class_student(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_extra_actors: None,
) -> None:
    await _seed_sessions(
        db_session,
        dates_and_statuses=[(date(2026, 1, 12), "Present")],
    )
    res = await client.get(
        _summary_url(STUDENT_A_UUID),
        headers=auth_header(role="Teacher", linked_id=STAFF_UUID),
    )
    assert res.status_code == 200, res.text
    assert res.json()["presentCount"] == 1


async def test_teacher_cannot_view_student_they_dont_teach(
    client: AsyncClient,
    seed_extra_actors: None,
) -> None:
    res = await client.get(
        _summary_url(STUDENT_A_UUID),
        headers=auth_header(role="Teacher", linked_id=OTHER_TEACHER_UUID),
    )
    assert res.status_code == 403


async def test_deputy_can_view_own_division_student(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_extra_actors: None,
) -> None:
    await _seed_sessions(
        db_session,
        dates_and_statuses=[(date(2026, 1, 12), "Absent")],
    )
    res = await client.get(
        _summary_url(STUDENT_A_UUID),
        headers=auth_header(role="DeputyHead", linked_id=DEPUTY_JHS_UUID),
    )
    assert res.status_code == 200, res.text
    assert res.json()["absentCount"] == 1


async def test_deputy_cannot_view_other_division_student(
    client: AsyncClient,
    seed_extra_actors: None,
) -> None:
    res = await client.get(
        _summary_url(STUDENT_A_UUID),
        headers=auth_header(role="DeputyHead", linked_id=DEPUTY_LP_UUID),
    )
    assert res.status_code == 403


async def test_calendar_excludes_days_with_no_session(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_extra_actors: None,
) -> None:
    # Only two sessions within the January window — the endpoint must
    # return exactly those two entries, not "no_session" placeholders
    # for the intervening days.
    await _seed_sessions(
        db_session,
        dates_and_statuses=[
            (date(2026, 1, 12), "Present"),
            (date(2026, 1, 15), "Late"),
        ],
    )
    res = await client.get(
        _calendar_url(STUDENT_A_UUID),
        headers=auth_header(role="Admin", linked_id=ADMIN_STAFF_UUID),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body == [
        {"date": "2026-01-12", "status": "present"},
        {"date": "2026-01-15", "status": "late"},
    ]
