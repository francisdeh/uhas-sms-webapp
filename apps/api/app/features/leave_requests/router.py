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
    LeaveRequestCreate,
    LeaveRequestRead,
    LeaveRequestsListResponse,
    LeaveStatusUpdate,
)
from app.features.leave_requests.service import LeaveRequestsService
from app.features.staff.model import Staff

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})

router = APIRouter(prefix="/leave-requests", tags=["leave-requests"])


def _to_read(row: LeaveRequest, requester: Staff, approver: Staff | None) -> LeaveRequestRead:
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
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> LeaveRequestsListResponse:
    """Teachers see only their own by default (`staffId` auto-filled
    from `linked_id`); Admin/Deputy see everyone unless they narrow
    with `?staffId=…`."""
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
    )
    return LeaveRequestsListResponse(
        items=[_to_read(r, req, app_) for (r, req, app_) in rows],
        total=total,
        page=page,
        size=size,
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
    """Own requests are visible; only Admin/Deputy see everyone's.

    Mirrors the list-endpoint gate so a teacher can't iterate UUIDs to
    read another staff member's leave.
    """
    row, req, app_ = await LeaveRequestsService.get(session, school_id, request_id)
    if user.role not in _APPROVER_ROLES and (
        not user.linked_id or str(user.linked_id) != str(row.staff_id)
    ):
        raise ForbiddenError("You may only view your own leave requests.")
    return _to_read(row, req, app_)


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
    row, req, app_ = await LeaveRequestsService.create(
        session, school_id, payload, default_staff_id=default_staff_id
    )
    return _to_read(row, req, app_)


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
    row, req, app_ = await LeaveRequestsService.update_status(
        session,
        school_id,
        request_id,
        payload,
        actor_staff_id=actor_staff_id,
        actor_role=actor_role,
    )
    return _to_read(row, req, app_)
