"""Business logic for notification delivery.

Two public entry points:

  * `NotificationsService.notify_audience(...)` — the fan-out primitive.
    Producer domains build an `AudienceSpec` and call this; the service
    resolves recipients, batch-inserts rows, and returns the count for
    logs/tests. Silent no-op when the audience resolves empty — matches
    the TS behaviour where "no unit heads exist yet" isn't an error.

  * `NotificationsService.notify_user(...)` — convenience for the
    common "one specific user" case (used by lesson-plan review, scheme
    ack, promotion send-back, etc.).

Plus the recipient-facing bell operations (`get_bell_data`,
`mark_all_read`, `mark_specific_read`).

All writes go through the caller's session — commit is the FastAPI
request boundary, so a producer's transaction rolls back cleanly if
the notification insert fails.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.notifications.audience import AudienceSpec, resolve_audience
from app.features.notifications.constants import NotificationKind
from app.features.notifications.model import Notification
from app.features.notifications.repository import NotificationsRepository
from app.features.schools.service import SchoolsService
from app.features.users.model import User


def _now() -> datetime:
    """DB DateTime columns are TIMESTAMP WITHOUT TIME ZONE."""
    return datetime.now(UTC).replace(tzinfo=None)


class NotifyPayload:
    """Kept as a plain class to avoid a Pydantic dependency in the hot
    path — producer domains build one directly. Only `title` and `body`
    are required; `link` is optional deep-link target."""

    __slots__ = ("body", "kind", "link", "title")

    def __init__(
        self,
        *,
        kind: NotificationKind,
        title: str,
        body: str,
        link: str | None = None,
    ) -> None:
        self.kind: NotificationKind = kind
        self.title = title
        self.body = body
        self.link = link


class NotificationsService:
    @staticmethod
    async def notify_audience(
        session: AsyncSession,
        school_id: UUID | str,
        audience: AudienceSpec,
        payload: NotifyPayload,
    ) -> int:
        """Fan-out primitive. Returns the number of rows inserted so
        callers (mostly tests) can assert on it."""
        school = await SchoolsService.get(session, school_id)
        recipient_ids = await resolve_audience(
            session,
            school_id,
            audience,
            academic_year=school.academic_year,
        )
        if not recipient_ids:
            return 0

        rows = [
            Notification(
                school_id=school_id,
                user_id=uid,
                kind=payload.kind,
                title=payload.title,
                body=payload.body,
                link=payload.link,
            )
            for uid in recipient_ids
        ]
        session.add_all(rows)
        await session.flush()
        return len(rows)

    @staticmethod
    async def notify_user(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        user_id: UUID | str,
        payload: NotifyPayload,
    ) -> None:
        """One-shot for when the producer already knows the recipient's
        user id. Skips the audience resolver entirely."""
        row = Notification(
            school_id=school_id,
            user_id=user_id,
            kind=payload.kind,
            title=payload.title,
            body=payload.body,
            link=payload.link,
        )
        session.add(row)
        await session.flush()

    # ─── Recipient-facing reads ────────────────────────────────────────

    @staticmethod
    async def get_bell_data(
        session: AsyncSession, user_id: UUID | str, *, limit: int = 10
    ) -> tuple[list[Notification], int]:
        items = await NotificationsRepository.list_for_user(session, user_id, limit=limit)
        unread = await NotificationsRepository.unread_count(session, user_id)
        return items, unread

    @staticmethod
    async def mark_all_read(session: AsyncSession, user_id: UUID | str) -> int:
        marked = await NotificationsRepository.mark_all_read(session, user_id, now=_now())
        await session.flush()
        return marked

    @staticmethod
    async def mark_specific_read(
        session: AsyncSession,
        user_id: UUID | str,
        ids: list[UUID],
    ) -> int:
        marked = await NotificationsRepository.mark_specific_read(session, user_id, ids, now=_now())
        await session.flush()
        return marked

    # ─── Producer-side helpers ─────────────────────────────────────────

    @staticmethod
    async def find_user_for_linked(
        session: AsyncSession,
        school_id: UUID | str,
        linked_id: UUID | str,
    ) -> User | None:
        """Resolve the app user whose `linked_id` points at the given
        staff or guardian id. Returns None if nobody's linked yet —
        producer domains treat that as "skip the notification" rather
        than an error (fresh onboarding, dev seed)."""
        stmt = select(User).where(and_(User.school_id == school_id, User.linked_id == linked_id))
        return (await session.execute(stmt)).scalar_one_or_none()
