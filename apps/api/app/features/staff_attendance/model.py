"""SQLAlchemy models for staff attendance.

Mirrors the student-attendance shape but keyed on `(school, division,
date)` instead of `(school, class, date)`. A Deputy Head for JHS logs
staff attendance for JHS staff only.
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


class StaffAttendanceSession(Base):
    __tablename__ = "staff_attendance_sessions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    division: Mapped[str] = mapped_column(String(50), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff.id"), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )


class StaffAttendanceRecord(Base):
    __tablename__ = "staff_attendance_records"

    session_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("staff_attendance_sessions.id"), nullable=False
    )
    staff_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (PrimaryKeyConstraint("session_id", "staff_id"),)
