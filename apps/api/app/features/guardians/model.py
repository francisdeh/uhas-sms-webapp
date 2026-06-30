"""SQLAlchemy model for the `guardians` table.

Mirrors the Drizzle definition. Per the dual-identifier rule
(Phase 1 PR #7), at least one of `email` / `phone` is required —
enforced by a CHECK constraint in the existing migration, not here.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Guardian(Base):
    __tablename__ = "guardians"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)

    __table_args__ = (UniqueConstraint("school_id", "slug", name="guardians_school_slug_unique"),)
