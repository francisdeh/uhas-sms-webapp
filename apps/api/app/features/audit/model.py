"""SQLAlchemy model for the `audit_log` table.

Audit rows are written by domain services on sensitive mutations
(settings updates, role changes, score overrides). The table is already
present in the database (from the Alembic baseline) — this module just
gives us a typed ORM handle so other features can write rows.

`before` and `after` are stored as JSON-serialised TEXT (not jsonb) to
match the existing schema. The service helper does the json.dumps
conversion so callers pass plain dicts.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func
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
    # JSON-serialised TEXT to match the existing schema (the other JSON
    # columns are jsonb; audit predates that convention). The service
    # helper does the serialisation so callers don't deal with it.
    before: Mapped[str | None] = mapped_column(Text, nullable=True)
    after: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    __table_args__ = (
        Index("audit_log_action_created_idx", "action", "created_at"),
        Index("audit_log_user_idx", "user_id"),
        Index("audit_log_target_idx", "target_table", "target_id"),
    )
