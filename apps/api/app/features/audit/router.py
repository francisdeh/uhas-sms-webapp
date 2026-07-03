"""HTTP routes for the audit log.

  GET /audit-log?action=X&from=YYYY-MM-DD&to=YYYY-MM-DD&page=N&size=M

Read-only. Admin-only. Audit rows are written by domain services on
their own mutation paths, never over HTTP — see
`app.features.audit.service.write_audit_log`.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError
from app.core.roles import ADMIN
from app.features.audit.actions import AuditAction
from app.features.audit.model import AuditLog
from app.features.audit.repository import AuditRepository
from app.features.audit.schema import AuditEventRead, AuditEventsListResponse

router = APIRouter(prefix="/audit-log", tags=["audit-log"])


def _to_read(row: AuditLog, actor_name: str | None) -> AuditEventRead:
    return AuditEventRead(
        id=row.id,
        user_id=row.user_id,
        actor_name=actor_name,
        action=row.action,
        target_table=row.target_table,
        target_id=row.target_id,
        before=row.before,
        after=row.after,
        created_at=row.created_at,
    )


@router.get(
    "",
    response_model=AuditEventsListResponse,
    response_model_by_alias=True,
)
async def list_audit_events(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    action: Annotated[AuditAction | None, Query()] = None,
    created_from: Annotated[
        date | None,
        Query(alias="from", description="Inclusive lower bound (YYYY-MM-DD)."),
    ] = None,
    created_to: Annotated[
        date | None,
        Query(alias="to", description="Inclusive upper bound (YYYY-MM-DD)."),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditEventsListResponse:
    if user.role != ADMIN:
        raise ForbiddenError("Only Admin can view the audit log.")

    # Translate the calendar dates into inclusive DateTime bounds.
    # `to`'s end-of-day handling is why we accept dates on the wire but
    # do the comparison against `audit_log.created_at` which is a
    # TIMESTAMP.
    from_dt = datetime.combine(created_from, time.min) if created_from is not None else None
    to_dt = datetime.combine(created_to, time.max) if created_to is not None else None

    rows, total = await AuditRepository.list_for_school(
        session,
        school_id,
        action=action,
        created_from=from_dt,
        created_to=to_dt,
        page=page,
        size=size,
    )

    # Resolve actor names in one join off the returned page.
    actor_map = await AuditRepository.resolve_actor_names(session, [row.user_id for row in rows])
    items = [_to_read(row, actor_map.get(str(row.user_id))) for row in rows]

    return AuditEventsListResponse(items=items, total=total, page=page, size=size)
