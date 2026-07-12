"""Data-access layer for leave requests."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.features.leave_requests.constants import APPROVED, CASUAL
from app.features.leave_requests.model import LeaveRequest
from app.features.staff.model import Staff


class LeaveRequestsRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        staff_id: UUID | str | None = None,
        status: str | None = None,
        division: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[LeaveRequest, Staff, Staff | None, Staff | None]], int]:
        """Return (requests, requester_staff, approver_staff,
        substitute_staff) tuples. `division` restricts to requesters in
        that division — the Deputy Head scope gate the service applies."""
        approver = aliased(Staff, name="approver")
        requester = aliased(Staff, name="requester")
        substitute = aliased(Staff, name="substitute")

        where = [LeaveRequest.school_id == school_id]
        if staff_id:
            where.append(LeaveRequest.staff_id == staff_id)
        if status:
            where.append(LeaveRequest.status == status)
        if division:
            where.append(requester.division == division)

        where_clause = and_(*where)
        count_stmt = (
            select(func.count(LeaveRequest.id))
            .join(requester, requester.id == LeaveRequest.staff_id)
            .where(where_clause)
        )
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(LeaveRequest, requester, approver, substitute)
            .join(requester, requester.id == LeaveRequest.staff_id)
            .outerjoin(approver, approver.id == LeaveRequest.approved_by_id)
            .outerjoin(substitute, substitute.id == LeaveRequest.substitute_staff_id)
            .where(where_clause)
            .order_by(desc(LeaveRequest.created_at))
            .offset(offset)
            .limit(size)
        )
        rows = [
            (r, req, app_, sub) for r, req, app_, sub in (await session.execute(rows_stmt)).all()
        ]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, request_id: UUID | str
    ) -> tuple[LeaveRequest, Staff, Staff | None, Staff | None] | None:
        approver = aliased(Staff, name="approver")
        requester = aliased(Staff, name="requester")
        substitute = aliased(Staff, name="substitute")
        stmt = (
            select(LeaveRequest, requester, approver, substitute)
            .join(requester, requester.id == LeaveRequest.staff_id)
            .outerjoin(approver, approver.id == LeaveRequest.approved_by_id)
            .outerjoin(substitute, substitute.id == LeaveRequest.substitute_staff_id)
            .where(
                and_(
                    LeaveRequest.id == request_id,
                    LeaveRequest.school_id == school_id,
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1], row[2], row[3]) if row else None

    @staticmethod
    async def sum_approved_casual_days(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        *,
        year_start: date,
        year_end: date,
    ) -> int:
        """Inclusive day-count of every `approved` Casual-type request
        for this staff member with `start_date` in `[year_start,
        year_end]`. Computed on the fly, not a maintained counter, so
        it can never drift from the source requests."""
        stmt = select(LeaveRequest.start_date, LeaveRequest.end_date).where(
            and_(
                LeaveRequest.school_id == school_id,
                LeaveRequest.staff_id == staff_id,
                LeaveRequest.type == CASUAL,
                LeaveRequest.status == APPROVED,
                LeaveRequest.start_date >= year_start,
                LeaveRequest.start_date <= year_end,
            )
        )
        rows = (await session.execute(stmt)).all()
        return sum((end - start).days + 1 for start, end in rows)
