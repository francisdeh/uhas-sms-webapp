"""SQLAlchemy model for the `enrollments` table.

An Enrollment links a student to a class for one academic year. Status
transitions (`Active` → `Repeating` / `Withdrawn`) are driven by
Promotions (Phase 2 #8) and the student-transfer flow.

Previously stubbed under `students/model.py` for the join in the People
PR — now owned here. Students still needs to *reference* enrollments
(for the current-year class join on the student list), but doesn't
define the model.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import Date, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.features.enrollments.constants import ACTIVE


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default=ACTIVE)
    enrollment_date: Mapped[date] = mapped_column(Date, nullable=False)
