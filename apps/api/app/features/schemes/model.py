"""SQLAlchemy model for `schemes`.

Column set matches the Drizzle baseline; state + reviewer auth in the
service. Soft-delete via `deleted_at`.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Scheme(Base):
    __tablename__ = "schemes"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    teacher_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("subjects.id"), nullable=False)
    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    reviewer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
