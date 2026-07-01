"""SQLAlchemy models for student attendance — session + record.

One `AttendanceSession` = (class, date). Records are per-student
rows attached to a session, keyed by `(session_id, student_id)`.
The batch endpoint in `service.py` upserts the whole set for a
session in one transaction; individual record edits are rare
(mistakes → re-save the whole class).
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    PrimaryKeyConstraint,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff.id"), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    session_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("attendance_sessions.id"), nullable=False
    )
    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    late_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (PrimaryKeyConstraint("session_id", "student_id"),)
