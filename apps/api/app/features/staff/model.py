"""SQLAlchemy model for the `staff` table.

Mirrors the Drizzle definition in `apps/web/src/db/schema.ts` and the
Alembic baseline — no schema changes here, just a typed ORM handle.

Per [docs/ENGINEERING-CONVENTIONS.md §3a]: PK is `uuid`
(DB-generated via `gen_random_uuid()`), and a separate `slug`
("STAFF-042") carries the human-readable identifier. Slug is unique
per school via the composite constraint declared at table level.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    uhas_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rank: Mapped[str | None] = mapped_column(String(100), nullable=True)
    system_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    division: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_unit_head: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    unit_head_of: Mapped[str | None] = mapped_column(String(50), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    __table_args__ = (UniqueConstraint("school_id", "slug", name="staff_school_slug_unique"),)
