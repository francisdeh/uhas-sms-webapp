"""HTTP routes for the audit log.

  GET /audit-log?action=X&userId=Y&targetTable=Z&targetId=W
      &from=YYYY-MM-DD&to=YYYY-MM-DD&page=N&size=M
  GET /audit-log/actors            → dropdown option set for the user filter
  GET /audit-log/export?...        → CSV of every row matching the same filters

Read-only. Admin-only. Audit rows are written by domain services on
their own mutation paths, never over HTTP — see
`app.features.audit.service.write_audit_log`.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError
from app.core.roles import ADMIN
from app.features.audit.actions import AuditAction
from app.features.audit.model import AuditLog
from app.features.audit.repository import AuditRepository
from app.features.audit.schema import AuditActorRead, AuditEventRead, AuditEventsListResponse

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


def _require_admin(user: CurrentUserDep) -> None:
    if user.role != ADMIN:
        raise ForbiddenError("Only Admin can view the audit log.")


def _date_bounds(
    created_from: date | None, created_to: date | None
) -> tuple[datetime | None, datetime | None]:
    # Translate the calendar dates into inclusive DateTime bounds.
    # `to`'s end-of-day handling is why we accept dates on the wire but
    # do the comparison against `audit_log.created_at` which is a
    # TIMESTAMP.
    from_dt = datetime.combine(created_from, time.min) if created_from is not None else None
    to_dt = datetime.combine(created_to, time.max) if created_to is not None else None
    return from_dt, to_dt


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
    user_id: Annotated[UUID | None, Query(alias="userId")] = None,
    target_table: Annotated[str | None, Query(alias="targetTable")] = None,
    target_id: Annotated[UUID | None, Query(alias="targetId")] = None,
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
    _require_admin(user)
    from_dt, to_dt = _date_bounds(created_from, created_to)

    rows, total = await AuditRepository.list_for_school(
        session,
        school_id,
        action=action,
        created_from=from_dt,
        created_to=to_dt,
        user_id=user_id,
        target_table=target_table,
        target_id=target_id,
        page=page,
        size=size,
    )

    # Resolve actor names in one join off the returned page.
    actor_map = await AuditRepository.resolve_actor_names(session, [row.user_id for row in rows])
    items = [_to_read(row, actor_map.get(str(row.user_id))) for row in rows]

    return AuditEventsListResponse(items=items, total=total, page=page, size=size)


@router.get(
    "/actors",
    response_model=list[AuditActorRead],
    response_model_by_alias=True,
    summary="Distinct actors who've appeared in this school's audit log — the user-filter dropdown",
)
async def list_audit_actors(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> list[AuditActorRead]:
    _require_admin(user)
    actor_ids = await AuditRepository.list_distinct_actor_ids(session, school_id)
    actor_map = await AuditRepository.resolve_actor_names(session, actor_ids)
    return sorted(
        (AuditActorRead(user_id=uid, name=actor_map.get(str(uid), str(uid))) for uid in actor_ids),
        key=lambda a: a.name.lower(),
    )


@router.get("/export", summary="CSV of every row matching the same filters as the list endpoint")
async def export_audit_events(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    action: Annotated[AuditAction | None, Query()] = None,
    user_id: Annotated[UUID | None, Query(alias="userId")] = None,
    target_table: Annotated[str | None, Query(alias="targetTable")] = None,
    target_id: Annotated[UUID | None, Query(alias="targetId")] = None,
    created_from: Annotated[date | None, Query(alias="from")] = None,
    created_to: Annotated[date | None, Query(alias="to")] = None,
) -> Response:
    _require_admin(user)
    from_dt, to_dt = _date_bounds(created_from, created_to)

    rows = await AuditRepository.list_all_matching(
        session,
        school_id,
        action=action,
        created_from=from_dt,
        created_to=to_dt,
        user_id=user_id,
        target_table=target_table,
        target_id=target_id,
    )
    actor_map = await AuditRepository.resolve_actor_names(session, [row.user_id for row in rows])

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Date/Time", "Actor", "Action", "Target Table", "Target ID"])
    for row in rows:
        writer.writerow(
            [
                row.created_at.isoformat() if row.created_at else "",
                actor_map.get(str(row.user_id), str(row.user_id)),
                row.action,
                row.target_table or "",
                str(row.target_id) if row.target_id else "",
            ]
        )

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )
