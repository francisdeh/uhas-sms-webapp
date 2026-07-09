"""Pydantic schemas for the audit-log HTTP layer.

Reads only — audit rows are written by domain services via
`write_audit_log` inside their own transactions, never by clients.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.audit.actions import AuditAction

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class AuditEventRead(BaseModel):
    """One row from the caller's audit log.

    `actor_name` is a joined display field — the audit row itself only
    stores `user_id`. The resolver falls back to the actor's email when
    no linked staff row exists (Parent auditor edge case, or a stub
    user account).
    """

    model_config = _CAMEL_CONFIG

    id: UUID
    user_id: UUID
    actor_name: str | None = None
    action: AuditAction
    target_table: str | None = None
    target_id: UUID | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    created_at: datetime | None = None


class AuditEventsListResponse(Paginated[AuditEventRead]):
    """Newest-first filtered page."""


class AuditActorRead(BaseModel):
    """One entry in the actor-filter dropdown — only users who've
    actually appeared in this school's audit log, not the full staff/
    guardian directory."""

    model_config = _CAMEL_CONFIG

    user_id: UUID
    name: str
