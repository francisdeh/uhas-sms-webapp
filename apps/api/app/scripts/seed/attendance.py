"""Attendance group — two school weeks of student + staff attendance
history for the current term, plus a few sample leave requests.

Ten weekday sessions (2026-01-12 through 2026-01-23, term 2's first two
weeks), one attendance session per class per day, one staff-attendance
session per division per day.
"""

from __future__ import annotations

import random
from datetime import date, timedelta
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.attendance.constants import ABSENT, EXCUSED, LATE, PRESENT
from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.leave_requests.model import LeaveRequest
from app.features.staff_attendance.constants import ON_LEAVE
from app.features.staff_attendance.constants import PRESENT as STAFF_PRESENT
from app.features.staff_attendance.model import StaffAttendanceRecord, StaffAttendanceSession
from app.scripts.seed.academic import AcademicResult, ClassRoster
from app.scripts.seed.identity import IdentityResult

_RNG_SEED = 20260703
CURRENT_TERM = 2

_SCHOOL_DAYS: tuple[date, ...] = tuple(
    day
    for day in (date(2026, 1, 12) + timedelta(days=offset) for offset in range(20))
    if day.weekday() < 5
)[:10]

_STUDENT_STATUS_WEIGHTS = ((PRESENT, 85), (ABSENT, 6), (LATE, 6), (EXCUSED, 3))
_STAFF_STATUS_WEIGHTS = ((STAFF_PRESENT, 90), (ABSENT, 4), (LATE, 4), (ON_LEAVE, 2))


def _weighted_choice(rng: random.Random, weights: tuple[tuple[str, int], ...]) -> str:
    return rng.choices([w[0] for w in weights], weights=[w[1] for w in weights], k=1)[0]


async def seed_attendance(
    session: AsyncSession, identity: IdentityResult, academic: AcademicResult
) -> None:
    # No relationship() exists anywhere in this codebase, so the ORM can't
    # infer cross-table insert ordering — sessions must be flushed before
    # records that FK to them.
    rng = random.Random(_RNG_SEED)

    att_sessions: list[tuple[AttendanceSession, ClassRoster]] = []
    for day in _SCHOOL_DAYS:
        for roster in academic.rosters.values():
            att_session = AttendanceSession(
                id=uuid4(),
                school_id=academic.school_id,
                class_id=roster.class_id,
                date=day,
                term=CURRENT_TERM,
                submitted_by_id=roster.teacher_staff_id,
            )
            att_sessions.append((att_session, roster))
            session.add(att_session)
    await session.flush()

    for att_session, roster in att_sessions:
        for student_id in roster.student_ids:
            status = _weighted_choice(rng, _STUDENT_STATUS_WEIGHTS)
            session.add(
                AttendanceRecord(
                    session_id=att_session.id,
                    student_id=student_id,
                    status=status,
                    late_reason="Transport delay" if status == LATE else None,
                )
            )

    divisions = {roster.division for roster in academic.rosters.values()}
    staff_by_division: dict[str, list[UUID]] = {d: [] for d in divisions}
    for roster in academic.rosters.values():
        staff_by_division[roster.division].append(roster.teacher_staff_id)
    # Deputy heads count toward their own division's staff-attendance roster too.
    deputy_slugs = {
        "KG": "STAFF-007",
        "Lower Primary": "STAFF-003",
        "Upper Primary": "STAFF-016",
        "JHS": "STAFF-002",
    }
    for division, slug in deputy_slugs.items():
        staff_by_division.setdefault(division, []).append(identity.staff_ids[slug])

    staff_sessions: list[tuple[StaffAttendanceSession, list[UUID]]] = []
    for day in _SCHOOL_DAYS:
        for division, staff_ids in staff_by_division.items():
            submitted_by = identity.staff_ids[deputy_slugs[division]]
            staff_session = StaffAttendanceSession(
                id=uuid4(),
                school_id=academic.school_id,
                division=division,
                date=day,
                term=CURRENT_TERM,
                submitted_by_id=submitted_by,
            )
            staff_sessions.append((staff_session, staff_ids))
            session.add(staff_session)
    await session.flush()

    for staff_session, staff_ids in staff_sessions:
        for staff_id in set(staff_ids):
            status = _weighted_choice(rng, _STAFF_STATUS_WEIGHTS)
            session.add(
                StaffAttendanceRecord(session_id=staff_session.id, staff_id=staff_id, status=status)
            )

    session.add_all(
        [
            LeaveRequest(
                id=uuid4(),
                school_id=academic.school_id,
                staff_id=identity.staff_ids["STAFF-005"],
                type="Sick",
                start_date=date(2026, 1, 19),
                end_date=date(2026, 1, 20),
                reason="Malaria — doctor's note on file.",
                status="approved",
                approved_by_id=identity.staff_ids["STAFF-002"],
            ),
            LeaveRequest(
                id=uuid4(),
                school_id=academic.school_id,
                staff_id=identity.staff_ids["STAFF-009"],
                type="Casual",
                start_date=date(2026, 2, 2),
                end_date=date(2026, 2, 2),
                reason="Family event.",
                status="pending",
            ),
        ]
    )

    await session.flush()
