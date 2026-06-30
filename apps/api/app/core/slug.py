"""Per-school sequential slug generation.

`STAFF-001`, `GUARDIAN-001`, `UHAS-2025-0001` — every domain that needs
a human-readable, per-school sequential id uses the same pattern:

  1. Read the current max sequence for `(school_id, prefix)`.
  2. Build the row with `prefix{seq:0Nd}`.
  3. Try insert; on uniqueness collision, bump and retry up to N times.

The race is real but small (two concurrent registrations under the same
prefix). The per-school slug uniqueness constraint catches it; this
helper just hides the retry boilerplate from every domain service.

If concurrency under one prefix ever spikes (multi-tenant SaaS, bulk
import), swap this for Postgres sequences in this one module — no
domain service needs to change.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError

# Number of retries on uniqueness collision. Three is plenty for our
# concurrency profile — one or two retries already covers any realistic
# burst; three is the safety floor.
_MAX_RETRIES = 3


async def insert_with_sequential_slug[T](
    session: AsyncSession,
    *,
    next_seq: Callable[[], Awaitable[int]],
    build_slug: Callable[[int], str],
    build_row: Callable[[str], T],
) -> T:
    """Insert a row whose slug is a per-school sequence.

    Args:
        session:    the AsyncSession to use; the caller's transaction.
        next_seq:   async fn → current "next" sequence number for this prefix.
        build_slug: int → slug string (`"STAFF-001"`, `"UHAS-2025-0001"`, …).
        build_row:  slug → the ORM row, fully populated except (potentially)
                    server-defaulted columns.

    Returns:
        The flushed ORM row (with server-generated id available).

    Raises:
        ConflictError: if we collide `_MAX_RETRIES` times — at our scale
        this would mean a genuinely abnormal burst, worth surfacing.
    """
    last_error: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        seq = await next_seq() + attempt
        slug = build_slug(seq)
        row = build_row(slug)
        session.add(row)
        try:
            await session.flush()
            return row
        except IntegrityError as err:
            last_error = err
            await session.rollback()
            continue

    raise ConflictError("Could not generate a unique slug after retries.") from last_error


def per_school_slug_resolver(
    session: AsyncSession,
    school_id: UUID | str,
    repo_next_slug_fn: Callable[[AsyncSession, UUID | str], Awaitable[int]],
) -> Callable[[], Awaitable[int]]:
    """Adapter to plug a repository's `next_slug_number` into the helper.

    Saves callers from writing the same one-line lambda. Repository
    method is expected to take `(session, school_id) → int`.
    """

    async def _resolve() -> int:
        return await repo_next_slug_fn(session, school_id)

    return _resolve
