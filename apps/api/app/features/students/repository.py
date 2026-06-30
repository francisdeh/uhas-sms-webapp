"""Data-access layer for Students.

`list_for_school` joins the current-year enrollment + class so the table
UI can render division + class in one round trip. Offset-paginated;
returns `(rows, total)` matching the `{ items, total, page, size }`
standard envelope.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.students.constants import ACTIVE
from app.features.students.model import Class, Enrollment, Student


class StudentsRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        academic_year: str,
        q: str | None = None,
        page: int = 1,
        size: int = 50,
        division: str | None = None,
        active_only: bool = False,
    ) -> tuple[list[tuple[Student, Class | None]], int]:
        """Return ((Student, Class | None) rows, total).

        Left-joins the current-year Active enrollment + class. Students
        without an active enrollment for the year still appear (Class is
        NULL) — unless `division` is set, which forces the join.
        """
        base: Any = (
            select(Student, Class)
            .outerjoin(
                Enrollment,
                and_(
                    Enrollment.student_id == Student.id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                ),
            )
            .outerjoin(Class, Class.id == Enrollment.class_id)
        )

        where = [Student.school_id == school_id]
        if active_only:
            where.append(Student.is_active.is_(True))
        if division:
            where.append(Class.division == division)
        if q:
            like = f"%{q}%"
            where.append(
                or_(
                    func.lower(Student.first_name).like(func.lower(like)),
                    func.lower(Student.last_name).like(func.lower(like)),
                    func.lower(Student.slug).like(func.lower(like)),
                )
            )

        where_clause = and_(*where)

        # Count uses the same join — division/q filters reach across.
        count_stmt = (
            select(func.count(Student.id))
            .select_from(Student)
            .outerjoin(
                Enrollment,
                and_(
                    Enrollment.student_id == Student.id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                ),
            )
            .outerjoin(Class, Class.id == Enrollment.class_id)
            .where(where_clause)
        )
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            base.where(where_clause)
            .order_by(asc(Student.last_name), asc(Student.id))
            .offset(offset)
            .limit(size)
        )
        result = (await session.execute(rows_stmt)).all()
        rows: list[tuple[Student, Class | None]] = [(s, c) for s, c in result]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        academic_year: str,
    ) -> tuple[Student, Class | None] | None:
        """Single-row fetch + current-year class join (or None when missing)."""
        stmt = select(Student).where(and_(Student.id == student_id, Student.school_id == school_id))
        student = (await session.execute(stmt)).scalar_one_or_none()
        if not student:
            return None

        class_stmt = (
            select(Class)
            .join(Enrollment, Class.id == Enrollment.class_id)
            .where(
                and_(
                    Enrollment.student_id == student.id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                )
            )
            .order_by(desc(Enrollment.enrollment_date))
            .limit(1)
        )
        cls = (await session.execute(class_stmt)).scalar_one_or_none()
        return student, cls

    @staticmethod
    async def find_class(
        session: AsyncSession, school_id: UUID | str, class_id: UUID | str
    ) -> Class | None:
        """Validate that a class belongs to this school before enrolling."""
        stmt = select(Class).where(and_(Class.id == class_id, Class.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def next_slug_number(session: AsyncSession, school_id: UUID | str, prefix: str) -> int:
        """Slug shape is `UHAS-YYYY-NNNN`; the year-prefix changes per year
        so the sequence resets every academic year. Service supplies the
        prefix."""
        stmt = (
            select(Student.slug)
            .where(and_(Student.school_id == school_id, Student.slug.like(f"{prefix}%")))
            .order_by(desc(Student.slug))
            .limit(1)
        )
        last = (await session.execute(stmt)).scalar_one_or_none()
        if not last:
            return 1
        try:
            return int(last[len(prefix) :]) + 1
        except ValueError:
            count_stmt = select(func.count(Student.id)).where(Student.school_id == school_id)
            return int((await session.execute(count_stmt)).scalar_one() or 0) + 1
