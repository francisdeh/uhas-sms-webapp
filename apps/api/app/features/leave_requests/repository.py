"""Data-access layer for leave requests."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

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
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[LeaveRequest, Staff, Staff | None]], int]:
        """Return (requests, requester_staff, approver_staff) tuples."""
        approver = aliased(Staff, name="approver")
        requester = aliased(Staff, name="requester")

        where = [LeaveRequest.school_id == school_id]
        if staff_id:
            where.append(LeaveRequest.staff_id == staff_id)
        if status:
            where.append(LeaveRequest.status == status)

        where_clause = and_(*where)
        total = int(
            (
                await session.execute(select(func.count(LeaveRequest.id)).where(where_clause))
            ).scalar_one()
            or 0
        )

        offset = (page - 1) * size
        rows_stmt = (
            select(LeaveRequest, requester, approver)
            .join(requester, requester.id == LeaveRequest.staff_id)
            .outerjoin(approver, approver.id == LeaveRequest.approved_by_id)
            .where(where_clause)
            .order_by(desc(LeaveRequest.created_at))
            .offset(offset)
            .limit(size)
        )
        rows = [(r, req, app_) for r, req, app_ in (await session.execute(rows_stmt)).all()]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, request_id: UUID | str
    ) -> tuple[LeaveRequest, Staff, Staff | None] | None:
        approver = aliased(Staff, name="approver")
        requester = aliased(Staff, name="requester")
        stmt = (
            select(LeaveRequest, requester, approver)
            .join(requester, requester.id == LeaveRequest.staff_id)
            .outerjoin(approver, approver.id == LeaveRequest.approved_by_id)
            .where(
                and_(
                    LeaveRequest.id == request_id,
                    LeaveRequest.school_id == school_id,
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1], row[2]) if row else None
