"""Business logic for leave requests.

Status machine (checked in `update_status`):
  pending → approved | rejected | cancelled
  approved → cancelled
  rejected → (terminal)
  cancelled → (terminal)
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD
from app.features.leave_requests.constants import (
    APPROVED,
    CANCELLED,
    PENDING,
    REJECTED,
)
from app.features.leave_requests.model import LeaveRequest
from app.features.leave_requests.repository import LeaveRequestsRepository
from app.features.leave_requests.schema import LeaveRequestCreate, LeaveStatusUpdate
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    PENDING: {APPROVED, REJECTED, CANCELLED},
    APPROVED: {CANCELLED},
    REJECTED: set(),
    CANCELLED: set(),
}


class LeaveRequestsService:
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
        return await LeaveRequestsRepository.list_for_school(
            session,
            school_id,
            staff_id=staff_id,
            status=status,
            page=page,
            size=size,
        )

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, request_id: UUID | str
    ) -> tuple[LeaveRequest, Staff, Staff | None]:
        row = await LeaveRequestsRepository.get_by_id(session, school_id, request_id)
        if not row:
            raise NotFoundError(f"Leave request {request_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: LeaveRequestCreate,
        *,
        default_staff_id: UUID | str | None,
    ) -> tuple[LeaveRequest, Staff, Staff | None]:
        target_staff_id = payload.staff_id or default_staff_id
        if not target_staff_id:
            raise ValidationError("staffId is required (no linkedId on token).")

        staff = await StaffRepository.get_by_id(session, school_id, target_staff_id)
        if not staff:
            raise ValidationError("Staff member not found in this school.")

        row = LeaveRequest(
            school_id=school_id,
            staff_id=target_staff_id,
            type=payload.type,
            start_date=payload.start_date,
            end_date=payload.end_date,
            reason=payload.reason,
            status=PENDING,
        )
        session.add(row)
        await session.flush()
        return row, staff, None

    @staticmethod
    async def update_status(
        session: AsyncSession,
        school_id: UUID | str,
        request_id: UUID | str,
        payload: LeaveStatusUpdate,
        *,
        actor_staff_id: UUID | str | None,
        actor_role: str,
    ) -> tuple[LeaveRequest, Staff, Staff | None]:
        row, _requester, _ = await LeaveRequestsService.get(session, school_id, request_id)

        if payload.status not in _ALLOWED_TRANSITIONS.get(row.status, set()):
            raise ValidationError(f"Cannot transition from {row.status!r} to {payload.status!r}.")

        # Cancellation is only the requester's own to do; Admin/Deputy
        # approve or reject. Nobody else can transition anyone else's.
        if payload.status == CANCELLED and (
            not actor_staff_id or str(actor_staff_id) != str(row.staff_id)
        ):
            raise ForbiddenError("Only the requester can cancel a leave request.")
        if payload.status in {APPROVED, REJECTED} and actor_role not in _APPROVER_ROLES:
            raise ForbiddenError("Only Admin or Deputy Head can approve/reject.")

        row.status = payload.status
        if payload.status in {APPROVED, REJECTED} and actor_staff_id:
            row.approved_by_id = actor_staff_id  # type: ignore[assignment]

        await session.flush()

        # Re-fetch enriched so the caller gets the joined approver row.
        return await LeaveRequestsService.get(session, school_id, row.id)
