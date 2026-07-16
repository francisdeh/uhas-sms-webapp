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

import logging
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.inngest import inngest_client
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
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
from app.features.notifications.audience import (
    AllAdminsAudience,
    StaffByDivisionAudience,
    resolve_audience,
)
from app.features.notifications.constants import LEAVE_REQUEST_DECIDED, LEAVE_REQUEST_SUBMITTED
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schools.repository import SchoolsRepository
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.users.model import User, UserPreferences

logger = logging.getLogger(__name__)

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})

# The email CTA and "manage preferences" links are role-scoped routes,
# so a single direction ("activity"/"decided") isn't enough to derive
# them the way it was for appointments (always teacher/parent). Admin
# has no dedicated leave-review page yet — the CTA falls back to the
# staff list until that's built (tracked as a follow-up PR). A role
# missing from either map means "skip this recipient's email/SMS
# entirely" — same "missing contact info is not an error" posture as
# a missing phone/email.
_LEAVE_REVIEW_PATH: dict[str, str] = {
    ADMIN: "/admin/staff",
    DEPUTY_HEAD: "/deputy-head/leave",
    TEACHER: "/teacher/leave",
}
_PROFILE_NOTIFICATIONS_PATH: dict[str, str] = {
    ADMIN: "/admin/profile?tab=notifications",
    DEPUTY_HEAD: "/deputy-head/profile?tab=notifications",
    TEACHER: "/teacher/profile?tab=notifications",
}

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


async def _notify_leave_channels(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    recipient_user: User,
    recipient_phone: str | None,
    preferences_link: str,
    direction: str,
    email_event: str,
    email_data: dict[str, Any],
    sms_body: str,
) -> None:
    """Email + SMS fan-out for a single leave-request recipient, on top
    of the in-app notification the caller already writes. `direction`
    is `"activity"` (approver-facing — submit) or `"decided"`
    (requester-facing — approve/reject); it selects both the
    school-level `notification_defaults` toggle and the per-user
    `user_preferences` columns to check. Same two-tier gate as
    `AppointmentsService._notify_appointment_channels` — `preferences_link`
    is a required argument here (not derived from `direction`) since a
    single direction can map to more than one recipient role/route
    (Admin vs Deputy Head), unlike appointments' teacher/parent split.
    """
    school = await SchoolsRepository.get_by_id(session, school_id)
    if school is None:
        return
    defaults = school.notification_defaults or {}
    if not defaults.get(f"on_leave_{direction}", True):
        return

    prefs = await session.scalar(
        select(UserPreferences).where(UserPreferences.user_id == recipient_user.id)
    )
    email_allowed = getattr(prefs, f"email_on_leave_{direction}", True) if prefs else True
    sms_allowed = getattr(prefs, f"sms_on_leave_{direction}", True) if prefs else True

    if recipient_user.email and email_allowed:
        try:
            await inngest_client.send(
                inngest.Event(
                    name=email_event,
                    data={
                        **email_data,
                        "school_name": school.name,
                        "school_address": school.address or "",
                        "school_contact_email": school.email or "",
                        "preferences_link": preferences_link,
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit %s for school %s", email_event, school_id)
            sentry_sdk.capture_exception()

    if recipient_phone and sms_allowed:
        try:
            await inngest_client.send(
                inngest.Event(
                    name="sms/fanout.requested",
                    data={
                        "school_id": str(school_id),
                        "category": "leave",
                        "body": sms_body,
                        "recipients": [{"phone": recipient_phone, "guardian_id": None}],
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit leave SMS fan-out for school %s", school_id)
            sentry_sdk.capture_exception()


async def _notify_leave_approvers(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    academic_year: str,
    division: str | None,
    requester_name: str,
    leave_type: str,
    start_date: date,
    end_date: date,
    reason: str | None,
) -> None:
    """Fans out `LEAVE_REQUEST_SUBMITTED` to every eligible approver —
    every Deputy Head of the requester's division plus every Admin,
    both simultaneously eligible (not a staged chain like lesson
    plans' Unit-Head-then-Deputy-Head review). A division with no
    Deputy Head still notifies the Admins; resolving zero approvers at
    all is a silent no-op, same as every other audience resolution in
    this codebase."""
    approver_ids: set[UUID] = set()
    if division:
        approver_ids.update(
            await resolve_audience(
                session,
                school_id,
                StaffByDivisionAudience(division=division, roles=[DEPUTY_HEAD]),
                academic_year=academic_year,
            )
        )
    approver_ids.update(
        await resolve_audience(session, school_id, AllAdminsAudience(), academic_year=academic_year)
    )
    if not approver_ids:
        return

    approvers = (
        (await session.execute(select(User).where(User.id.in_(approver_ids)))).scalars().all()
    )
    linked_ids = [a.linked_id for a in approvers if a.linked_id]
    staff_by_id: dict[UUID, Staff] = {}
    if linked_ids:
        staff_rows = (
            (await session.execute(select(Staff).where(Staff.id.in_(linked_ids)))).scalars().all()
        )
        staff_by_id = {s.id: s for s in staff_rows}

    body = (
        f"{requester_name} requested {leave_type} leave "
        f"({start_date.isoformat()} to {end_date.isoformat()})."
    )
    for approver in approvers:
        review_path = _LEAVE_REVIEW_PATH.get(approver.role)
        await NotificationsService.notify_user(
            session,
            school_id,
            user_id=approver.id,
            payload=NotifyPayload(
                kind=LEAVE_REQUEST_SUBMITTED,
                title="Leave request submitted",
                body=body,
                link=review_path,
            ),
        )
        preferences_path = _PROFILE_NOTIFICATIONS_PATH.get(approver.role)
        if not review_path or not preferences_path:
            continue
        approver_staff = staff_by_id.get(approver.linked_id) if approver.linked_id else None
        await _notify_leave_channels(
            session,
            school_id,
            recipient_user=approver,
            recipient_phone=approver_staff.phone if approver_staff else None,
            preferences_link=preferences_path,
            direction="activity",
            email_event="email/leave-requested.requested",
            email_data={
                "approver_email": approver.email,
                "requester_name": requester_name,
                "leave_type": leave_type,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "reason": reason or "",
                "link": review_path,
            },
            sms_body=f"{body} Check UHAS SMS to review.",
        )


async def _notify_leave_requester(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    requester: Staff,
    leave_type: str,
    start_date: date,
    end_date: date,
    action: str,
    rejection_reason: str | None,
) -> None:
    """Notifies the requester that their leave request was approved or
    rejected. Structurally identical to `AppointmentsService.respond`'s
    guardian notification — single recipient, direction `"decided"`."""
    requester_user = await NotificationsService.find_user_for_linked(
        session, school_id, requester.id
    )
    if requester_user is None:
        return

    body = (
        f"Your {leave_type} leave request ({start_date.isoformat()} to "
        f"{end_date.isoformat()}) was {action}."
    )
    review_path = _LEAVE_REVIEW_PATH.get(requester.system_role or "")
    await NotificationsService.notify_user(
        session,
        school_id,
        user_id=requester_user.id,
        payload=NotifyPayload(
            kind=LEAVE_REQUEST_DECIDED,
            title=f"Leave request {action}",
            body=body,
            link=review_path,
        ),
    )

    preferences_path = _PROFILE_NOTIFICATIONS_PATH.get(requester.system_role or "")
    if not review_path or not preferences_path:
        return
    await _notify_leave_channels(
        session,
        school_id,
        recipient_user=requester_user,
        recipient_phone=requester.phone,
        preferences_link=preferences_path,
        direction="decided",
        email_event="email/leave-decided.requested",
        email_data={
            "requester_email": requester_user.email,
            "leave_type": leave_type,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "action": action,
            "rejection_reason": rejection_reason or "",
            "link": review_path,
        },
        sms_body=f"{body} Check UHAS SMS for details.",
    )


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

        school = await SchoolsRepository.get_by_id(session, school_id)
        if school is not None:
            await _notify_leave_approvers(
                session,
                school_id,
                academic_year=school.academic_year,
                division=staff.division,
                requester_name=f"{staff.first_name} {staff.last_name}",
                leave_type=row.type,
                start_date=row.start_date,
                end_date=row.end_date,
                reason=row.reason,
            )

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
            await _notify_leave_requester(
                session,
                school_id,
                requester=requester,
                leave_type=row.type,
                start_date=row.start_date,
                end_date=row.end_date,
                action=payload.status,
                rejection_reason=row.rejection_reason,
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
