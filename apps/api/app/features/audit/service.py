"""Audit-log write helper — cross-cutting, called from every feature's service.

Mirrors `apps/web/src/lib/audit-log.ts` but on the FastAPI side. Records
who did what to which row, with before/after snapshots. Callers pass
plain Python dicts; this helper handles JSON serialisation.

Usage:

    from app.features.audit.service import write_audit_log

    await write_audit_log(
        session,
        school_id=current_school_id,
        user_id=current_user.user_id,
        action="SCHOOL_SETTINGS_UPDATE",
        target_table="schools",
        target_id=school_id,
        before={"name": "Old School"},
        after={"name": "New School"},
    )

The session passed in must be the same one the calling service is using —
the audit row commits as part of the same transaction. Don't pass a
fresh session; the caller's commit/rollback should govern the row's fate.

`user_id` and `target_id` are uuid columns. Callers should pass either
a `uuid.UUID` instance or a uuid-shaped string — SQLAlchemy casts
either correctly. The TS side uses `SYSTEM_ACTOR_UUID` (all-zeros) as
the "no human actor" sentinel; pass that here when the actor is the
system itself.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog


def _serialise(value: dict[str, Any] | None) -> str | None:
    """Serialise a snapshot dict to JSON. Returns None if input is None.

    `default=str` so datetime/date/Decimal-like values stringify cleanly
    without crashing the write. Audit rows are forensic; lossy stringify
    on edge types is preferable to refusing to record the row at all.
    """
    if value is None:
        return None
    return json.dumps(value, default=str)


async def write_audit_log(
    session: AsyncSession,
    *,
    school_id: UUID | str,
    user_id: UUID | str,
    action: str,
    target_table: str | None = None,
    target_id: UUID | str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> AuditLog:
    """Insert one audit_log row in the caller's transaction.

    Returns the inserted row for tests / log-and-read flows. The session
    is NOT committed here — the caller's session lifecycle handles that
    (see app.core.db.get_session). This keeps audit rows atomic with
    the mutation they record.
    """
    # id is server-defaulted (gen_random_uuid()); SQLAlchemy fetches it back.
    row = AuditLog(
        school_id=school_id,
        user_id=user_id,
        action=action,
        target_table=target_table,
        target_id=target_id,
        before=_serialise(before),
        after=_serialise(after),
    )
    session.add(row)
    # Flush so caller can read row.id / row.created_at if they want.
    # The commit still belongs to the outer transaction.
    await session.flush()
    return row
