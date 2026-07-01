"""Data-access layer for Enrollments.

The list query joins Class so the display shape carries the class name
without a second round trip — matches the shape the class-roster UI
consumes.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.students.model import Student


class EnrollmentsRepository:
    @staticmethod
    async def list_for_student(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Enrollment, Class, Student]], int]:
        """Enrollment history for one student, most recent first."""
        where = and_(
            Enrollment.student_id == student_id,
            Student.id == Enrollment.student_id,
            Student.school_id == school_id,
        )
        total_stmt = (
            select(func.count(Enrollment.id))
            .join(Student, Student.id == Enrollment.student_id)
            .where(where)
        )
        total = int((await session.execute(total_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        stmt = (
            select(Enrollment, Class, Student)
            .join(Class, Class.id == Enrollment.class_id)
            .join(Student, Student.id == Enrollment.student_id)
            .where(where)
            .order_by(desc(Enrollment.academic_year), desc(Enrollment.enrollment_date))
            .offset(offset)
            .limit(size)
        )
        return [(e, c, s) for e, c, s in (await session.execute(stmt)).all()], total

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
        """Roster of a class — used by teacher / class-detail views."""
        where_clauses = [
            Enrollment.class_id == class_id,
            Class.id == Enrollment.class_id,
            Class.school_id == school_id,
        ]
        if status:
            where_clauses.append(Enrollment.status == status)
        where = and_(*where_clauses)

        total_stmt = (
            select(func.count(Enrollment.id))
            .join(Class, Class.id == Enrollment.class_id)
            .where(where)
        )
        total = int((await session.execute(total_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        stmt = (
            select(Enrollment, Class, Student)
            .join(Class, Class.id == Enrollment.class_id)
            .join(Student, Student.id == Enrollment.student_id)
            .where(where)
            .order_by(asc(Student.last_name), asc(Student.first_name))
            .offset(offset)
            .limit(size)
        )
        return [(e, c, s) for e, c, s in (await session.execute(stmt)).all()], total

    @staticmethod
    async def get_active_for_student(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        academic_year: str,
    ) -> Enrollment | None:
        """Uniqueness-adjacent check: one active enrollment per year per student."""
        stmt = (
            select(Enrollment)
            .join(Student, Student.id == Enrollment.student_id)
            .where(
                and_(
                    Enrollment.student_id == student_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                    Student.school_id == school_id,
                )
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, enrollment_id: UUID | str
    ) -> tuple[Enrollment, Class, Student] | None:
        stmt = (
            select(Enrollment, Class, Student)
            .join(Class, Class.id == Enrollment.class_id)
            .join(Student, Student.id == Enrollment.student_id)
            .where(and_(Enrollment.id == enrollment_id, Student.school_id == school_id))
        )
        row = (await session.execute(stmt)).first()
        if not row:
            return None
        return row[0], row[1], row[2]
