"""Audit-log write helper — cross-cutting, called from every feature's service.

Records who did what to which row, with before/after snapshots. Callers
pass plain Python dicts; SQLAlchemy hands them straight to the JSONB
column with no string serialisation step.

Usage:

    from app.features.audit.actions import SCHOOL_SETTINGS_UPDATE
    from app.features.audit.service import write_audit_log

    await write_audit_log(
        session,
        school_id=current_school_id,
        user_id=current_user.user_id,
        action=SCHOOL_SETTINGS_UPDATE,
        target_table="schools",
        target_id=school_id,
        before={"name": "Old School"},
        after={"name": "New School"},
    )

The session passed in must be the same one the calling service is using —
the audit row commits as part of the same transaction. Don't pass a
fresh session; the caller's commit/rollback should govern the row's fate.

`user_id` and `target_id` accept either `uuid.UUID` or a uuid-shaped
string — SQLAlchemy casts either correctly. The TS side uses
`SYSTEM_ACTOR_UUID` (all-zeros) as the "no human actor" sentinel; pass
that here when the actor is the system itself.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.actions import AuditAction
from app.features.audit.model import AuditLog


async def write_audit_log(
    session: AsyncSession,
    *,
    school_id: UUID | str,
    user_id: UUID | str,
    action: AuditAction,
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
    # `before` / `after` go straight into JSONB columns — no json.dumps step.
    row = AuditLog(
        school_id=school_id,
        user_id=user_id,
        action=action,
        target_table=target_table,
        target_id=target_id,
        before=before,
        after=after,
    )
    session.add(row)
    # Flush so caller can read row.id / row.created_at if they want.
    # The commit still belongs to the outer transaction.
    await session.flush()
    return row
