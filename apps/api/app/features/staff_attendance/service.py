"""Business logic for staff attendance."""

from __future__ import annotations

from datetime import date as date_type
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.features.staff.model import Staff
from app.features.staff_attendance.model import StaffAttendanceRecord, StaffAttendanceSession
from app.features.staff_attendance.repository import StaffAttendanceRepository
from app.features.staff_attendance.schema import StaffAttendanceSessionUpsertRequest


class StaffAttendanceService:
    @staticmethod
    async def upsert_session(
        session: AsyncSession,
        school_id: UUID | str,
        payload: StaffAttendanceSessionUpsertRequest,
        *,
        actor_staff_id: UUID | str | None,
    ) -> StaffAttendanceSession:
        # Every payload staff_id must be an active staff member in the
        # target division for this school.
        allowed = await StaffAttendanceRepository.list_active_staff_in_division(
            session, school_id, payload.division
        )
        payload_ids = {r.staff_id for r in payload.records}
        stray = payload_ids - allowed
        if stray:
            raise ValidationError(
                f"{len(stray)} record(s) reference staff not in {payload.division}."
            )

        existing = await StaffAttendanceRepository.find_session(
            session, school_id, division=payload.division, date=payload.date
        )
        if existing:
            existing.term = payload.term
            existing.submitted_by_id = actor_staff_id  # type: ignore[assignment]
            attendance_session = existing
            await StaffAttendanceRepository.delete_records(session, attendance_session.id)
        else:
            attendance_session = StaffAttendanceSession(
                school_id=school_id,
                division=payload.division,
                date=payload.date,
                term=payload.term,
                submitted_by_id=actor_staff_id,
            )
            session.add(attendance_session)
            await session.flush()

        for r in payload.records:
            session.add(
                StaffAttendanceRecord(
                    session_id=attendance_session.id,
                    staff_id=r.staff_id,
                    status=r.status,
                    note=r.note,
                )
            )
        await session.flush()
        return attendance_session

    @staticmethod
    async def get_session_with_records(
        session: AsyncSession,
        school_id: UUID | str,
        session_id: UUID | str,
    ) -> tuple[
        StaffAttendanceSession,
        Staff | None,
        list[tuple[StaffAttendanceRecord, Staff]],
    ]:
        row = await StaffAttendanceRepository.get_session(session, school_id, session_id)
        if not row:
            raise NotFoundError(f"Staff-attendance session {session_id!r} not found.")
        sess, staff = row
        records = await StaffAttendanceRepository.list_records(session, sess.id)
        return sess, staff, records

    @staticmethod
    async def find_session(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        division: str,
        date: date_type,
    ) -> StaffAttendanceSession | None:
        return await StaffAttendanceRepository.find_session(
            session, school_id, division=division, date=date
        )

    @staticmethod
    async def list_sessions(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        division: str | None = None,
        term: int | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[StaffAttendanceSession, Staff | None, int, int, int, int]], int]:
        return await StaffAttendanceRepository.list_sessions(
            session, school_id, division=division, term=term, page=page, size=size
        )
