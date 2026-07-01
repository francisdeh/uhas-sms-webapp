"""Business logic for the Enrollments domain.

Two flows this service handles today:

  - **enroll**: creates a fresh Active enrollment for a student in a
    class for the current academic year. Rejects duplicates
    (one Active per student per year) with 409.
  - **change_status**: narrow transition endpoint. Full promotion
    (Active → Repeating + close-out + open next-year Active) lives in
    the promotions service (Phase 2 #8) — this endpoint is the low-
    level primitive it composes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.enrollments.repository import EnrollmentsRepository
from app.features.enrollments.schema import EnrollmentCreate, EnrollmentStatusUpdate
from app.features.schools.repository import SchoolsRepository
from app.features.students.model import Student
from app.features.students.repository import StudentsRepository


async def _academic_year(session: AsyncSession, school_id: UUID | str) -> str:
    school = await SchoolsRepository.get_by_id(session, school_id)
    if not school:
        raise NotFoundError(f"School {school_id!r} not found.")
    return school.academic_year


class EnrollmentsService:
    @staticmethod
    async def list_for_student(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Enrollment, Class, Student]], int]:
        # 404 the parent so a bad student_id doesn't quietly return [].
        year = await _academic_year(session, school_id)
        student = await StudentsRepository.get_by_id(
            session, school_id, student_id, academic_year=year
        )
        if not student:
            raise NotFoundError(f"Student {student_id!r} not found.")
        return await EnrollmentsRepository.list_for_student(
            session, school_id, student_id, page=page, size=size
        )

    @staticmethod
    async def list_for_class(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        *,
        status: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Enrollment, Class, Student]], int]:
        cls = await ClassesRepository.get_by_id(session, school_id, class_id)
        if not cls:
            raise NotFoundError(f"Class {class_id!r} not found.")
        return await EnrollmentsRepository.list_for_class(
            session, school_id, class_id, status=status, page=page, size=size
        )

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, enrollment_id: UUID | str
    ) -> tuple[Enrollment, Class, Student]:
        row = await EnrollmentsRepository.get_by_id(session, school_id, enrollment_id)
        if not row:
            raise NotFoundError(f"Enrollment {enrollment_id!r} not found.")
        return row

    @staticmethod
    async def enroll(
        session: AsyncSession,
        school_id: UUID | str,
        payload: EnrollmentCreate,
    ) -> tuple[Enrollment, Class, Student]:
        year = await _academic_year(session, school_id)

        # Validate student + class belong to this school.
        student_row = await StudentsRepository.get_by_id(
            session, school_id, payload.student_id, academic_year=year
        )
        if not student_row:
            raise ValidationError("Student not found in this school.")
        student, _ = student_row
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")

        existing = await EnrollmentsRepository.get_active_for_student(
            session, school_id, payload.student_id, year
        )
        if existing:
            raise ConflictError(
                f"Student already has an active enrollment in {year}.",
            )

        enrollment = Enrollment(
            student_id=payload.student_id,
            class_id=payload.class_id,
            academic_year=year,
            status=ACTIVE,
            enrollment_date=datetime.now(UTC).date(),
        )
        session.add(enrollment)
        await session.flush()
        return enrollment, cls, student

    @staticmethod
    async def change_status(
        session: AsyncSession,
        school_id: UUID | str,
        enrollment_id: UUID | str,
        payload: EnrollmentStatusUpdate,
    ) -> tuple[Enrollment, Class, Student]:
        enrollment, cls, student = await EnrollmentsService.get(session, school_id, enrollment_id)
        if enrollment.status == payload.status:
            raise ConflictError(f"Enrollment already has status {payload.status!r}.")
        enrollment.status = payload.status
        await session.flush()
        return enrollment, cls, student
