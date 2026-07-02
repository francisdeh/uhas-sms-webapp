"""Data-access for notification reads.

Reads are per-user only (the recipient's own list). Writes go through
`NotificationsService.notify_audience` — it batches inserts, so no
`create` method belongs here.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.notifications.model import Notification


class NotificationsRepository:
    @staticmethod
    async def list_for_user(
        session: AsyncSession,
        user_id: UUID | str,
        *,
        limit: int = 10,
    ) -> list[Notification]:
        stmt = (
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(desc(Notification.created_at))
            .limit(limit)
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def unread_count(session: AsyncSession, user_id: UUID | str) -> int:
        stmt = select(func.count(Notification.id)).where(
            and_(
                Notification.user_id == user_id,
                Notification.read_at.is_(None),
            )
        )
        return int((await session.execute(stmt)).scalar_one() or 0)

    @staticmethod
    async def mark_all_read(session: AsyncSession, user_id: UUID | str, *, now: datetime) -> int:
        """Returns the number of rows flipped from unread → read."""
        result = await session.execute(
            update(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.read_at.is_(None),
                )
            )
            .values(read_at=now)
        )
        return int(getattr(result, "rowcount", 0) or 0)

    @staticmethod
    async def mark_specific_read(
        session: AsyncSession,
        user_id: UUID | str,
        ids: Sequence[UUID | str],
        *,
        now: datetime,
    ) -> int:
        """Marks specific rows read. Silently drops IDs that don't
        belong to the caller — no leak of another user's notifications,
        no error if the ID list contains foreign IDs."""
        if not ids:
            return 0
        result = await session.execute(
            update(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.id.in_(list(ids)),
                    Notification.read_at.is_(None),
                )
            )
            .values(read_at=now)
        )
        return int(getattr(result, "rowcount", 0) or 0)
