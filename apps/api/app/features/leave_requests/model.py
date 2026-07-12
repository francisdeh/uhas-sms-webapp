"""SQLAlchemy model for `leave_requests`.

Every leave request is a staff member's — students don't file leave
via this table (students' absences are captured on the attendance
record with status="Excused" + a note).

Status transitions:
  pending → approved | rejected | cancelled
  approved → cancelled  (staff-initiated cancellation of an approved leave)

`approved_by_id` is only set when status flips to `approved` or
`rejected`; on `cancelled` we leave it as-is for the audit trail.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    staff_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    approved_by_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Informational only — who's covering the requester's classes.
    # Doesn't touch class_teachers/class_subjects/attendance.
    substitute_staff_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff.id"), nullable=True
    )
    # Supporting documents (e.g. a doctor's note), always optional. A
    # bare path array rather than a labelled child table like
    # student_documents — always uploaded by the requester at creation
    # time, no ambiguity about uploader, no label taxonomy needed.
    document_urls: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
