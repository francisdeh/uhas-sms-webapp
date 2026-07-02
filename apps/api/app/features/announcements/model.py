"""SQLAlchemy model for the `announcements` table.

Column set matches the Drizzle baseline. Audience is a free-form
string; see `announcements.audience` for the format. Delete is a hard
delete (matches the TS side) — there's no soft-delete recovery path.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[str] = mapped_column(String(100), nullable=False)
    is_critical: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    created_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
