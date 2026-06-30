"""SQLAlchemy model for the `audit_log` table.

Audit rows are written by domain services on sensitive mutations
(settings updates, role changes, score overrides).

`before` and `after` are JSONB — callers pass plain Python dicts and
SQLAlchemy hands them to the column. Migration `63bbd48d03f4` upgraded
the columns from Text → JSONB.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    # No FK on user_id — the historical row should survive deletion of
    # the actor (e.g., decommissioned admin account).
    user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_table: Mapped[str | None] = mapped_column(String(100), nullable=True)
    target_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    __table_args__ = (
        Index("audit_log_action_created_idx", "action", "created_at"),
        Index("audit_log_user_idx", "user_id"),
        Index("audit_log_target_idx", "target_table", "target_id"),
    )
