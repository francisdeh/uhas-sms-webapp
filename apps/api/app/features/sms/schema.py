"""Pydantic schemas for the SMS domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.sms.constants import SmsCategory, SmsProviderName, SmsStatus

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)

# International E.164: leading `+`, 2-15 digits, first digit non-zero.
E164_PATTERN = r"^\+[1-9]\d{1,14}$"


class SmsSendRequest(BaseModel):
    """Input to `SmsService.send(...)` — one message to one recipient."""

    model_config = _CAMEL_CONFIG

    recipient_phone: str = Field(..., pattern=E164_PATTERN)
    recipient_guardian_id: UUID | None = None
    category: SmsCategory
    body: str = Field(..., min_length=1, max_length=480)


class SmsLogRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    recipient_phone: str
    recipient_guardian_id: UUID | None = None
    category: SmsCategory
    body: str
    provider: SmsProviderName
    provider_message_id: str | None = None
    status: SmsStatus
    cost_minor: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SmsLogListResponse(Paginated[SmsLogRead]):
    """Newest-first, filterable by category. See `app.core.pagination.Paginated`."""
