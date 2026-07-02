"""Pydantic schemas for the Notifications HTTP layer.

Wire shapes only. The `AudienceSpec` discriminated union deliberately
mirrors the TS side one-to-one; producer domains build these locally,
not from the wire, so JSON conversion never actually happens for it —
it's here so we can share the type with tests.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.features.notifications.constants import NotificationKind

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class NotificationRead(BaseModel):
    """One row from the recipient's own list — used by the bell dropdown."""

    model_config = _CAMEL_CONFIG

    id: UUID
    kind: NotificationKind
    title: str
    body: str
    link: str | None = None
    read_at: datetime | None = None
    created_at: datetime


class BellData(BaseModel):
    """Compound response for the bell poll — list + unread count in one
    round trip. The dropdown shows at most 10; the badge shows the full
    unread count so a user with 25 unread sees `25` and the top 10."""

    model_config = _CAMEL_CONFIG

    unread_count: int
    items: list[NotificationRead]


class MarkReadRequest(BaseModel):
    """POST /notifications/mark-read — marks specific rows read."""

    model_config = _CAMEL_CONFIG

    ids: list[UUID] = Field(default_factory=list)


class MarkReadResponse(BaseModel):
    model_config = _CAMEL_CONFIG

    marked: int
