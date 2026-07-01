"""Data-access layer for staff attendance."""

from __future__ import annotations

from datetime import date as date_type
from uuid import UUID

from sqlalchemy import and_, asc, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.staff.model import Staff
from app.features.staff_attendance.constants import ABSENT, LATE, ON_LEAVE, PRESENT
from app.features.staff_attendance.model import (
    StaffAttendanceRecord,
    StaffAttendanceSession,
)


class StaffAttendanceRepository:
    @staticmethod
    async def find_session(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        division: str,
        date: date_type,
    ) -> StaffAttendanceSession | None:
        stmt = select(StaffAttendanceSession).where(
            and_(
                StaffAttendanceSession.school_id == school_id,
                StaffAttendanceSession.division == division,
                StaffAttendanceSession.date == date,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_session(
        session: AsyncSession, school_id: UUID | str, session_id: UUID | str
    ) -> tuple[StaffAttendanceSession, Staff | None] | None:
        stmt = (
            select(StaffAttendanceSession, Staff)
            .outerjoin(Staff, Staff.id == StaffAttendanceSession.submitted_by_id)
            .where(
                and_(
                    StaffAttendanceSession.id == session_id,
                    StaffAttendanceSession.school_id == school_id,
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1]) if row else None

    @staticmethod
    async def list_records(
        session: AsyncSession, session_id: UUID | str
    ) -> list[tuple[StaffAttendanceRecord, Staff]]:
        stmt = (
            select(StaffAttendanceRecord, Staff)
            .join(Staff, Staff.id == StaffAttendanceRecord.staff_id)
            .where(StaffAttendanceRecord.session_id == session_id)
            .order_by(asc(Staff.last_name), asc(Staff.first_name))
        )
        return [(rec, s) for rec, s in (await session.execute(stmt)).all()]

    @staticmethod
    async def delete_records(session: AsyncSession, session_id: UUID | str) -> None:
        stmt = select(StaffAttendanceRecord).where(StaffAttendanceRecord.session_id == session_id)
        for row in (await session.execute(stmt)).scalars().all():
            await session.delete(row)
        await session.flush()

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
        counts = (
            select(
                StaffAttendanceRecord.session_id.label("session_id"),
                func.sum(case((StaffAttendanceRecord.status == PRESENT, 1), else_=0)).label("p"),
                func.sum(case((StaffAttendanceRecord.status == ABSENT, 1), else_=0)).label("a"),
                func.sum(case((StaffAttendanceRecord.status == LATE, 1), else_=0)).label("l"),
                func.sum(case((StaffAttendanceRecord.status == ON_LEAVE, 1), else_=0)).label("ol"),
            )
            .group_by(StaffAttendanceRecord.session_id)
            .subquery()
        )

        where = [StaffAttendanceSession.school_id == school_id]
        if division:
            where.append(StaffAttendanceSession.division == division)
        if term is not None:
            where.append(StaffAttendanceSession.term == term)

        where_clause = and_(*where)
        total = int(
            (
                await session.execute(
                    select(func.count(StaffAttendanceSession.id)).where(where_clause)
                )
            ).scalar_one()
            or 0
        )

        offset = (page - 1) * size
        rows_stmt = (
            select(
                StaffAttendanceSession,
                Staff,
                func.coalesce(counts.c.p, 0),
                func.coalesce(counts.c.a, 0),
                func.coalesce(counts.c.l, 0),
                func.coalesce(counts.c.ol, 0),
            )
            .outerjoin(Staff, Staff.id == StaffAttendanceSession.submitted_by_id)
            .outerjoin(counts, counts.c.session_id == StaffAttendanceSession.id)
            .where(where_clause)
            .order_by(desc(StaffAttendanceSession.date))
            .offset(offset)
            .limit(size)
        )
        rows = [
            (sess, staff, int(p), int(a), int(late_ct), int(ol))
            for sess, staff, p, a, late_ct, ol in (await session.execute(rows_stmt)).all()
        ]
        return rows, total

    @staticmethod
    async def list_active_staff_in_division(
        session: AsyncSession, school_id: UUID | str, division: str
    ) -> set[UUID]:
        """Set of active staff IDs in the target division — the payload
        validator checks every recorded staffId against this set."""
        stmt = select(Staff.id).where(
            and_(
                Staff.school_id == school_id,
                Staff.division == division,
                Staff.is_active.is_(True),
            )
        )
        return {row for row in (await session.execute(stmt)).scalars().all()}
