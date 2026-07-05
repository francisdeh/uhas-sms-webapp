"""HTTP routes for student attendance.

POST  /attendance/sessions                            → batch upsert (session + records)
GET   /attendance/sessions                            → paged history (filters: classId, term)
GET   /attendance/sessions/{id}                       → session + records
GET   /attendance/sessions/lookup                     → find by (classId, date) — 200 or 404

GET   /students/{id}/attendance-summary               → status counts over a date range
GET   /students/{id}/attendance-calendar              → per-day status over a date range

The parent-facing summary + calendar endpoints hang off `/students/{id}`
so they compose naturally with the other student-scoped views. They're
exported as a second router so `main.py` can mount them at that prefix
without contorting `/attendance/*`.
"""

from __future__ import annotations

from datetime import date as date_type
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import NotFoundError
from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.attendance.schema import (
    AttendanceRecordRead,
    AttendanceSessionRead,
    AttendanceSessionsListResponse,
    AttendanceSessionSummary,
    AttendanceSessionUpsertRequest,
    StudentAttendanceCalendarEntry,
    StudentAttendanceSummary,
)
from app.features.attendance.service import AttendanceService
from app.features.classes.model import Class
from app.features.schools.repository import SchoolsRepository
from app.features.staff.model import Staff
from app.features.students.model import Student

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _to_record_read(rec: AttendanceRecord, student: Student) -> AttendanceRecordRead:
    return AttendanceRecordRead(
        student_id=rec.student_id,
        student_first_name=student.first_name,
        student_last_name=student.last_name,
        student_slug=student.slug,
        status=rec.status,
        late_reason=rec.late_reason,
        note=rec.note,
    )


def _to_session_read(
    sess: AttendanceSession,
    cls: Class,
    staff: Staff | None,
    records: list[tuple[AttendanceRecord, Student]],
) -> AttendanceSessionRead:
    return AttendanceSessionRead(
        id=sess.id,
        school_id=sess.school_id,
        class_id=sess.class_id,
        class_name=cls.name,
        date=sess.date,
        term=sess.term,
        submitted_by_id=sess.submitted_by_id,
        submitted_by_name=(f"{staff.first_name} {staff.last_name}" if staff else None),
        submitted_at=sess.submitted_at,
        records=[_to_record_read(r, st) for r, st in records],
    )


def _to_summary(
    sess: AttendanceSession,
    cls: Class,
    staff: Staff | None,
    present: int,
    absent: int,
    late: int,
    excused: int,
) -> AttendanceSessionSummary:
    return AttendanceSessionSummary(
        id=sess.id,
        class_id=sess.class_id,
        class_name=cls.name,
        date=sess.date,
        term=sess.term,
        present_count=present,
        absent_count=absent,
        late_count=late,
        excused_count=excused,
        submitted_by_name=(f"{staff.first_name} {staff.last_name}" if staff else None),
        submitted_at=sess.submitted_at,
    )


# ─── POST /attendance/sessions ────────────────────────────────────────────────


@router.post(
    "/sessions",
    response_model=AttendanceSessionRead,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Batch-save attendance for a class on a date",
)
async def upsert_session(
    payload: AttendanceSessionUpsertRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AttendanceSessionRead:
    """Any authenticated staff (Teacher/DeputyHead/Admin) can save; the
    role gate is soft on POST — teachers save their own classes.
    """
    school = await SchoolsRepository.get_by_id(session, school_id)
    if not school:
        raise NotFoundError(f"School {school_id!r} not found.")

    actor_staff_id: UUID | str | None = user.linked_id
    upserted = await AttendanceService.upsert_session(
        session,
        school_id,
        payload,
        actor_staff_id=actor_staff_id,
        academic_year=school.academic_year,
    )
    sess, cls, staff, records = await AttendanceService.get_session_with_records(
        session, school_id, upserted.id
    )
    return _to_session_read(sess, cls, staff, records)


# ─── GET /attendance/sessions ─────────────────────────────────────────────────


@router.get(
    "/sessions",
    response_model=AttendanceSessionsListResponse,
    response_model_by_alias=True,
)
async def list_sessions(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    class_id: Annotated[UUID | None, Query(alias="classId")] = None,
    term: Annotated[int | None, Query(ge=1, le=3)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # A term's worth of daily sessions for one class fetched in one page
    # rather than paginating — up to 500 to match the heaviest caller.
    size: Annotated[int, Query(ge=1, le=500)] = 50,
) -> AttendanceSessionsListResponse:
    rows, total = await AttendanceService.list_sessions(
        session, school_id, class_id=class_id, term=term, page=page, size=size
    )
    return AttendanceSessionsListResponse(
        items=[_to_summary(s, c, st, p, a, la, e) for (s, c, st, p, a, la, e) in rows],
        total=total,
        page=page,
        size=size,
    )


# ─── GET /attendance/sessions/lookup ──────────────────────────────────────────


@router.get(
    "/sessions/lookup",
    response_model=AttendanceSessionRead,
    response_model_by_alias=True,
    summary="Find the session for (classId, date) — 404 if none yet",
)
async def lookup_session(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    class_id: Annotated[UUID, Query(alias="classId")],
    date: Annotated[date_type, Query()],
) -> AttendanceSessionRead:
    """Used by the roster UI to check whether a class has already saved
    attendance for today — 404 means "not yet"; 200 means "load these
    records into the form"."""
    existing = await AttendanceService.find_session(
        session, school_id, class_id=class_id, date=date
    )
    if not existing:
        raise NotFoundError("No attendance session for this class + date.")
    sess, cls, staff, records = await AttendanceService.get_session_with_records(
        session, school_id, existing.id
    )
    return _to_session_read(sess, cls, staff, records)


# ─── GET /attendance/sessions/{id} ────────────────────────────────────────────


@router.get(
    "/sessions/{session_id}",
    response_model=AttendanceSessionRead,
    response_model_by_alias=True,
)
async def get_session_by_id(
    session_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AttendanceSessionRead:
    sess, cls, staff, records = await AttendanceService.get_session_with_records(
        session, school_id, session_id
    )
    return _to_session_read(sess, cls, staff, records)


# ─── Nested under /students/{student_id} ──────────────────────────────────────
# Mounted separately in main.py; kept here so all attendance surfaces
# are discoverable in one place.

students_router = APIRouter(prefix="/students", tags=["attendance"])


@students_router.get(
    "/{student_id}/attendance-summary",
    response_model=StudentAttendanceSummary,
    response_model_by_alias=True,
    summary="Aggregate status counts for a student over a date range",
)
async def get_student_attendance_summary(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    term_start: Annotated[date_type, Query(alias="termStart")],
    term_end: Annotated[date_type, Query(alias="termEnd")],
) -> StudentAttendanceSummary:
    return await AttendanceService.get_student_summary(
        session,
        school_id,
        user,
        student_id=student_id,
        term_start=term_start,
        term_end=term_end,
    )


@students_router.get(
    "/{student_id}/attendance-calendar",
    response_model=list[StudentAttendanceCalendarEntry],
    response_model_by_alias=True,
    summary="Per-day status for a student over a date range",
)
async def get_student_attendance_calendar(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    term_start: Annotated[date_type, Query(alias="termStart")],
    term_end: Annotated[date_type, Query(alias="termEnd")],
) -> list[StudentAttendanceCalendarEntry]:
    return await AttendanceService.get_student_calendar(
        session,
        school_id,
        user,
        student_id=student_id,
        term_start=term_start,
        term_end=term_end,
    )
