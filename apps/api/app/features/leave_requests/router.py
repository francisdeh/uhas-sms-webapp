"""HTTP routes for leave requests."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError
from app.core.roles import ADMIN, DEPUTY_HEAD
from app.features.leave_requests.model import LeaveRequest
from app.features.leave_requests.schema import (
    LeaveBalanceRead,
    LeaveRequestCreate,
    LeaveRequestRead,
    LeaveRequestsListResponse,
    LeaveStatusUpdate,
    LeaveSubstituteUpdate,
)
from app.features.leave_requests.service import LeaveRequestsService
from app.features.staff.model import Staff

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})

router = APIRouter(prefix="/leave-requests", tags=["leave-requests"])


def _to_read(
    row: LeaveRequest, requester: Staff, approver: Staff | None, substitute: Staff | None
) -> LeaveRequestRead:
    return LeaveRequestRead(
        id=row.id,
        school_id=row.school_id,
        staff_id=row.staff_id,
        staff_first_name=requester.first_name,
        staff_last_name=requester.last_name,
        type=row.type,
        start_date=row.start_date,
        end_date=row.end_date,
        reason=row.reason,
        status=row.status,
        approved_by_id=row.approved_by_id,
        approved_by_name=(f"{approver.first_name} {approver.last_name}" if approver else None),
        rejection_reason=row.rejection_reason,
        substitute_staff_id=row.substitute_staff_id,
        substitute_staff_name=(
            f"{substitute.first_name} {substitute.last_name}" if substitute else None
        ),
        document_urls=row.document_urls or [],
        created_at=row.created_at,
    )


@router.get(
    "",
    response_model=LeaveRequestsListResponse,
    response_model_by_alias=True,
)
async def list_leave_requests(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    staff_id: Annotated[UUID | None, Query(alias="staffId")] = None,
    status_: Annotated[str | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # A "show every approved leave this year" view fetches up to 500 in
    # one page rather than paginating.
    size: Annotated[int, Query(ge=1, le=500)] = 50,
) -> LeaveRequestsListResponse:
    """Teachers see only their own by default (`staffId` auto-filled
    from `linked_id`); Admin sees everyone unless narrowed with
    `?staffId=…`; Deputy Head is scoped to their own division
    regardless of `?staffId=…`."""
    effective_staff_id = staff_id
    if user.role not in _APPROVER_ROLES:
        effective_staff_id = UUID(user.linked_id) if user.linked_id else None

    rows, total = await LeaveRequestsService.list_for_school(
        session,
        school_id,
        staff_id=effective_staff_id,
        status=status_,
        page=page,
        size=size,
        user=user,
    )
    return LeaveRequestsListResponse(
        items=[_to_read(r, req, app_, sub) for (r, req, app_, sub) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/balance/{staff_id}",
    response_model=LeaveBalanceRead,
    response_model_by_alias=True,
    summary="Casual leave balance for the current calendar year",
)
async def get_leave_balance(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LeaveBalanceRead:
    entitlement, used, remaining = await LeaveRequestsService.get_balance(
        session, school_id, staff_id, user=user
    )
    return LeaveBalanceRead(
        staff_id=staff_id,
        entitlement_days=entitlement,
        used_days=used,
        remaining_days=remaining,
    )


@router.get(
    "/{request_id}",
    response_model=LeaveRequestRead,
    response_model_by_alias=True,
)
async def get_leave_request(
    request_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LeaveRequestRead:
    """Own requests are visible; Admin sees everyone's; Deputy Head sees
    only their own division's — enforced in the service, not just this
    router (mirrors the list-endpoint gate)."""
    row, req, app_, sub = await LeaveRequestsService.get_for_viewer(
        session, school_id, request_id, user=user
    )
    return _to_read(row, req, app_, sub)


@router.post(
    "",
    response_model=LeaveRequestRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_leave_request(
    payload: LeaveRequestCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LeaveRequestRead:
    """A staff member files leave for themselves; only Admin/Deputy can
    file on behalf of another staff (identified by `payload.staffId`)."""
    if (
        payload.staff_id
        and (not user.linked_id or str(payload.staff_id) != str(user.linked_id))
        and user.role not in _APPROVER_ROLES
    ):
        raise ForbiddenError(
            "Only Admin or Deputy Head can file leave on behalf of another staff member."
        )

    default_staff_id: UUID | str | None = user.linked_id
    row, req, app_, sub = await LeaveRequestsService.create(
        session, school_id, payload, default_staff_id=default_staff_id
    )
    return _to_read(row, req, app_, sub)


@router.patch(
    "/{request_id}",
    response_model=LeaveRequestRead,
    response_model_by_alias=True,
)
async def update_leave_status(
    request_id: UUID,
    payload: LeaveStatusUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LeaveRequestRead:
    actor_staff_id: UUID | str | None = user.linked_id
    actor_role = user.role or ""
    row, req, app_, sub = await LeaveRequestsService.update_status(
        session,
        school_id,
        request_id,
        payload,
        actor_staff_id=actor_staff_id,
        actor_role=actor_role,
        actor_user_id=user.user_id,
    )
    return _to_read(row, req, app_, sub)


@router.patch(
    "/{request_id}/substitute",
    response_model=LeaveRequestRead,
    response_model_by_alias=True,
    summary="Assign or clear the covering staff member — Admin or Deputy Head only",
)
async def update_leave_substitute(
    request_id: UUID,
    payload: LeaveSubstituteUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LeaveRequestRead:
    row, req, app_, sub = await LeaveRequestsService.update_substitute(
        session, school_id, request_id, payload, user=user
    )
    return _to_read(row, req, app_, sub)
