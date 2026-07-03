"""SQLAlchemy model for the `sms_log` table.

One row per outbound SMS attempt. Written before the provider call so
a crash mid-send still leaves a `queued` row — see the migration
docstring (`1cb5816e6a2a_sms_log_table.py`) for the write-then-send
ordering rationale.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SmsLog(Base):
    __tablename__ = "sms_log"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    recipient_guardian_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("guardians.id"), nullable=True
    )
    category: Mapped[str] = mapped_column(String(30), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    provider_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    cost_minor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
