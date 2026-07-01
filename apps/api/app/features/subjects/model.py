"""SQLAlchemy model for the `subjects` table.

A Subject is per-school and typically division-scoped ("English" in JHS
is a different row from "English" in Lower Primary — the curriculum,
weighting, and teacher pool differ).

Naming convention (per [docs/ENGINEERING-CONVENTIONS.md §3a]):
UUID PK + separate short slug (`MATH`, `ENG`, `SCI`) that surfaces in
report cards and audit logs. Slug is unique per school.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    division: Mapped[str | None] = mapped_column(String(50), nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, default="Core")

    __table_args__ = (UniqueConstraint("school_id", "slug", name="subjects_school_slug_unique"),)
