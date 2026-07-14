"""HTTP routes for the recipient-facing bell.

  GET  /notifications/bell           → list (10 latest) + unread count
  POST /notifications/mark-all-read  → mark every unread → read
  POST /notifications/mark-read      → mark specific ids → read

There's no producer endpoint. Notifications are written by domain
services calling `NotificationsService.notify_audience(...)` inside
their own request handlers — never over HTTP.

Every route is bound to the caller: they can only ever see or mutate
their own notifications. Cross-user reads are impossible because the
recipient id is derived from the JWT `user_id`, not accepted from the
client.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentUserDep
from app.features.notifications.model import Notification
from app.features.notifications.schema import (
    BellData,
    MarkReadRequest,
    MarkReadResponse,
    NotificationRead,
)
from app.features.notifications.service import NotificationsService

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _to_read(row: Notification) -> NotificationRead:
    return NotificationRead(
        id=row.id,
        kind=row.kind,
        title=row.title,
        body=row.body,
        link=row.link,
        read_at=row.read_at,
        created_at=row.created_at,
    )


@router.get("/bell", response_model=BellData, response_model_by_alias=True)
async def get_bell(
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> BellData:
    """Compound endpoint the FE polls every 60s — one round trip for
    both the badge count and the top-10 dropdown items."""
    items, unread = await NotificationsService.get_bell_data(session, UUID(user.user_id), limit=10)
    return BellData(unread_count=unread, items=[_to_read(r) for r in items])


@router.post(
    "/mark-all-read",
    response_model=MarkReadResponse,
    response_model_by_alias=True,
)
async def mark_all_read(
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> MarkReadResponse:
    """Idempotent. Called by the explicit "Mark all as read" button."""
    marked = await NotificationsService.mark_all_read(session, UUID(user.user_id))
    return MarkReadResponse(marked=marked)


@router.post(
    "/mark-read",
    response_model=MarkReadResponse,
    response_model_by_alias=True,
)
async def mark_read(
    payload: MarkReadRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> MarkReadResponse:
    """Marks specific rows read. IDs that don't belong to the caller
    are silently dropped — no error, no leak of another user's rows."""
    marked = await NotificationsService.mark_specific_read(
        session, UUID(user.user_id), list(payload.ids)
    )
    return MarkReadResponse(marked=marked)
