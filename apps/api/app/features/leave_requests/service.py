"""Business logic for leave requests.

Status machine (checked in `update_status`):
  pending → approved | rejected | cancelled
  approved → cancelled
  rejected → (terminal)
  cancelled → (terminal)

Division scoping: a Deputy Head may only see/approve/reject requests
from staff in their own division — enforced here, not just assumed by
the frontend (a pre-design audit found the previous version of this
service had no division check at all despite the UI claiming one).
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD
from app.core.security import CurrentUser
from app.features.audit.actions import LEAVE_DECIDED
from app.features.audit.service import write_audit_log
from app.features.leave_requests.constants import (
    APPROVED,
    CANCELLED,
    PENDING,
    REJECTED,
)
from app.features.leave_requests.model import LeaveRequest
from app.features.leave_requests.repository import LeaveRequestsRepository
from app.features.leave_requests.schema import (
    LeaveRequestCreate,
    LeaveStatusUpdate,
    LeaveSubstituteUpdate,
)
from app.features.schools.repository import SchoolsRepository
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    PENDING: {APPROVED, REJECTED, CANCELLED},
    APPROVED: {CANCELLED},
    REJECTED: set(),
    CANCELLED: set(),
}

LeaveRow = tuple[LeaveRequest, Staff, Staff | None, Staff | None]


async def _division_of(
    session: AsyncSession, school_id: UUID | str, staff_id: UUID | str | None
) -> str | None:
    """The given staff member's division, or None if unresolvable."""
    if not staff_id:
        return None
    staff = await StaffRepository.get_by_id(session, school_id, staff_id)
    return staff.division if staff else None


def _assert_can_view_own(row: LeaveRequest, *, user: CurrentUser) -> None:
    """Gate for the non-Admin, non-DeputyHead case — a teacher may only
    view their own request. Called only from that branch; Admin and
    DeputyHead are handled by the caller before this runs."""
    if not user.linked_id or str(user.linked_id) != str(row.staff_id):
        raise ForbiddenError("You may only view your own leave requests.")


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
        user: CurrentUser,
    ) -> tuple[list[LeaveRow], int]:
        division = None
        if user.role == DEPUTY_HEAD:
            division = await _division_of(session, school_id, user.linked_id)
        return await LeaveRequestsRepository.list_for_school(
            session,
            school_id,
            staff_id=staff_id,
            status=status,
            division=division,
            page=page,
            size=size,
        )

    @staticmethod
    async def get(session: AsyncSession, school_id: UUID | str, request_id: UUID | str) -> LeaveRow:
        row = await LeaveRequestsRepository.get_by_id(session, school_id, request_id)
        if not row:
            raise NotFoundError(f"Leave request {request_id!r} not found.")
        return row

    @staticmethod
    async def get_for_viewer(
        session: AsyncSession,
        school_id: UUID | str,
        request_id: UUID | str,
        *,
        user: CurrentUser,
    ) -> LeaveRow:
        row, requester, approver, substitute = await LeaveRequestsService.get(
            session, school_id, request_id
        )
        if user.role == DEPUTY_HEAD:
            division = await _division_of(session, school_id, user.linked_id)
            if not division or requester.division != division:
                raise ForbiddenError("You may only view leave requests in your own division.")
        else:
            _assert_can_view_own(row, user=user)
        return row, requester, approver, substitute

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: LeaveRequestCreate,
        *,
        default_staff_id: UUID | str | None,
    ) -> LeaveRow:
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
            document_urls=payload.document_urls or None,
        )
        session.add(row)
        await session.flush()
        return row, staff, None, None

    @staticmethod
    async def update_status(
        session: AsyncSession,
        school_id: UUID | str,
        request_id: UUID | str,
        payload: LeaveStatusUpdate,
        *,
        actor_staff_id: UUID | str | None,
        actor_role: str,
        actor_user_id: UUID | str,
    ) -> LeaveRow:
        row, requester, _approver, _substitute = await LeaveRequestsService.get(
            session, school_id, request_id
        )

        if payload.status not in _ALLOWED_TRANSITIONS.get(row.status, set()):
            raise ValidationError(f"Cannot transition from {row.status!r} to {payload.status!r}.")

        # Cancellation is only the requester's own to do; Admin/Deputy
        # approve or reject. Nobody else can transition anyone else's.
        if payload.status == CANCELLED and (
            not actor_staff_id or str(actor_staff_id) != str(row.staff_id)
        ):
            raise ForbiddenError("Only the requester can cancel a leave request.")
        if payload.status in {APPROVED, REJECTED}:
            if actor_role not in _APPROVER_ROLES:
                raise ForbiddenError("Only Admin or Deputy Head can approve/reject.")
            if actor_role == DEPUTY_HEAD:
                division = await _division_of(session, school_id, actor_staff_id)
                if not division or requester.division != division:
                    raise ForbiddenError(
                        "You may only approve/reject leave requests in your own division."
                    )

        before_status = row.status
        row.status = payload.status
        if payload.status in {APPROVED, REJECTED} and actor_staff_id:
            row.approved_by_id = actor_staff_id  # type: ignore[assignment]
        if payload.status == REJECTED:
            row.rejection_reason = payload.rejection_reason
        elif payload.status == APPROVED:
            row.rejection_reason = None

        await session.flush()

        if payload.status in {APPROVED, REJECTED}:
            await write_audit_log(
                session,
                school_id=school_id,
                user_id=actor_user_id,
                action=LEAVE_DECIDED,
                target_table="leave_requests",
                target_id=row.id,
                before={"status": before_status},
                after={"status": payload.status, "rejectionReason": row.rejection_reason},
            )

        # Re-fetch enriched so the caller gets the joined approver row.
        return await LeaveRequestsService.get(session, school_id, row.id)

    @staticmethod
    async def update_substitute(
        session: AsyncSession,
        school_id: UUID | str,
        request_id: UUID | str,
        payload: LeaveSubstituteUpdate,
        *,
        user: CurrentUser,
    ) -> LeaveRow:
        if user.role not in _APPROVER_ROLES:
            raise ForbiddenError("Only Admin or Deputy Head can assign a substitute.")
        row, requester, _approver, _substitute = await LeaveRequestsService.get(
            session, school_id, request_id
        )
        if user.role == DEPUTY_HEAD:
            division = await _division_of(session, school_id, user.linked_id)
            if not division or requester.division != division:
                raise ForbiddenError("You may only assign a substitute within your own division.")
        if payload.substitute_staff_id:
            substitute = await StaffRepository.get_by_id(
                session, school_id, payload.substitute_staff_id
            )
            if not substitute:
                raise ValidationError("Substitute staff member not found in this school.")

        row.substitute_staff_id = payload.substitute_staff_id
        await session.flush()
        return await LeaveRequestsService.get(session, school_id, row.id)

    @staticmethod
    async def get_balance(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        *,
        user: CurrentUser,
    ) -> tuple[int, int, int]:
        """`(entitlement_days, used_days, remaining_days)` for Casual
        leave, for the current calendar year."""
        is_self = user.linked_id is not None and str(user.linked_id) == str(staff_id)
        if user.role == ADMIN:
            pass
        elif user.role == DEPUTY_HEAD:
            target = await StaffRepository.get_by_id(session, school_id, staff_id)
            if not target:
                raise NotFoundError(f"Staff member {staff_id!r} not found.")
            division = await _division_of(session, school_id, user.linked_id)
            if not division or target.division != division:
                raise ForbiddenError("You may only view leave balances in your own division.")
        elif not is_self:
            raise ForbiddenError("You may only view your own leave balance.")

        school = await SchoolsRepository.get_by_id(session, school_id)
        if not school:
            raise NotFoundError(f"School {school_id!r} not found.")

        # UTC, not local machine/server time — matches ReportsService's
        # `_today()` convention; a naive `date.today()` here caused a
        # real flaky-test bug elsewhere in this codebase (see the
        # staff-profile-depth PR).
        today = datetime.now(UTC).date()
        year_start = date(today.year, 1, 1)
        year_end = date(today.year, 12, 31)
        used = await LeaveRequestsRepository.sum_approved_casual_days(
            session, school_id, staff_id, year_start=year_start, year_end=year_end
        )
        entitlement = school.casual_leave_annual_days
        remaining = max(0, entitlement - used)
        return entitlement, used, remaining
