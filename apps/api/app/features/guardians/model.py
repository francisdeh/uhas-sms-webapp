"""SQLAlchemy model for the `guardians` table.

Per the dual-identifier rule (Phase 1 PR #7), at least one of
`email` / `phone` is required — enforced in Pydantic
(`GuardianCreate._email_or_phone_required`), not by a DB constraint.
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
    # Set when this guardian record IS a staff member (their own child at
    # the school). One guardian identity per staff member is enforced
    # app-layer (find-or-create by staff_id), not a DB constraint.
    staff_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)

    __table_args__ = (UniqueConstraint("school_id", "slug", name="guardians_school_slug_unique"),)
