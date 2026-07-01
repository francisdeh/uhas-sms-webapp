"""HTTP routes for staff attendance.

Only Admins + Deputy Heads can save (staff attendance is a management
task). Everyone with a valid JWT can read (needed for the staff
dashboard's own history view).
"""

from __future__ import annotations

from datetime import date as date_type
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdminOrDeputy
from app.core.errors import NotFoundError
from app.features.staff.model import Staff
from app.features.staff_attendance.model import StaffAttendanceRecord, StaffAttendanceSession
from app.features.staff_attendance.schema import (
    StaffAttendanceRecordRead,
    StaffAttendanceSessionRead,
    StaffAttendanceSessionsListResponse,
    StaffAttendanceSessionSummary,
    StaffAttendanceSessionUpsertRequest,
)
from app.features.staff_attendance.service import StaffAttendanceService

router = APIRouter(prefix="/staff-attendance", tags=["staff-attendance"])


def _to_record_read(rec: StaffAttendanceRecord, staff: Staff) -> StaffAttendanceRecordRead:
    return StaffAttendanceRecordRead(
        staff_id=rec.staff_id,
        staff_first_name=staff.first_name,
        staff_last_name=staff.last_name,
        staff_slug=staff.slug,
        status=rec.status,
        note=rec.note,
    )


def _to_session_read(
    sess: StaffAttendanceSession,
    submitter: Staff | None,
    records: list[tuple[StaffAttendanceRecord, Staff]],
) -> StaffAttendanceSessionRead:
    return StaffAttendanceSessionRead(
        id=sess.id,
        school_id=sess.school_id,
        division=sess.division,
        date=sess.date,
        term=sess.term,
        submitted_by_id=sess.submitted_by_id,
        submitted_by_name=(f"{submitter.first_name} {submitter.last_name}" if submitter else None),
        submitted_at=sess.submitted_at,
        records=[_to_record_read(r, s) for r, s in records],
    )


def _to_summary(
    sess: StaffAttendanceSession,
    submitter: Staff | None,
    present: int,
    absent: int,
    late: int,
    on_leave: int,
) -> StaffAttendanceSessionSummary:
    return StaffAttendanceSessionSummary(
        id=sess.id,
        division=sess.division,
        date=sess.date,
        term=sess.term,
        present_count=present,
        absent_count=absent,
        late_count=late,
        on_leave_count=on_leave,
        submitted_by_name=(f"{submitter.first_name} {submitter.last_name}" if submitter else None),
        submitted_at=sess.submitted_at,
    )


@router.post(
    "/sessions",
    response_model=StaffAttendanceSessionRead,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Batch-save staff attendance for a division on a date",
)
async def upsert_session(
    payload: StaffAttendanceSessionUpsertRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdminOrDeputy,
) -> StaffAttendanceSessionRead:
    actor_staff_id: UUID | str | None = user.linked_id
    upserted = await StaffAttendanceService.upsert_session(
        session, school_id, payload, actor_staff_id=actor_staff_id
    )
    sess, submitter, records = await StaffAttendanceService.get_session_with_records(
        session, school_id, upserted.id
    )
    return _to_session_read(sess, submitter, records)


@router.get(
    "/sessions",
    response_model=StaffAttendanceSessionsListResponse,
    response_model_by_alias=True,
)
async def list_sessions(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    division: Annotated[str | None, Query()] = None,
    term: Annotated[int | None, Query(ge=1, le=3)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> StaffAttendanceSessionsListResponse:
    rows, total = await StaffAttendanceService.list_sessions(
        session, school_id, division=division, term=term, page=page, size=size
    )
    return StaffAttendanceSessionsListResponse(
        items=[_to_summary(s, submitter, p, a, la, ol) for (s, submitter, p, a, la, ol) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/sessions/lookup",
    response_model=StaffAttendanceSessionRead,
    response_model_by_alias=True,
)
async def lookup_session(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    division: Annotated[str, Query()],
    date: Annotated[date_type, Query()],
) -> StaffAttendanceSessionRead:
    existing = await StaffAttendanceService.find_session(
        session, school_id, division=division, date=date
    )
    if not existing:
        raise NotFoundError("No staff-attendance session for this division + date.")
    sess, submitter, records = await StaffAttendanceService.get_session_with_records(
        session, school_id, existing.id
    )
    return _to_session_read(sess, submitter, records)


@router.get(
    "/sessions/{session_id}",
    response_model=StaffAttendanceSessionRead,
    response_model_by_alias=True,
)
async def get_session_by_id(
    session_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> StaffAttendanceSessionRead:
    sess, submitter, records = await StaffAttendanceService.get_session_with_records(
        session, school_id, session_id
    )
    return _to_session_read(sess, submitter, records)
