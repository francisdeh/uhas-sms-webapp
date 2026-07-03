"""Data-access layer for the global-search endpoint.

Three narrow queries — students, staff, classes — one per domain that
the Cmd-K palette exposes. Each caps at 8 results; a per-domain cap
prevents any single popular substring from swamping the palette.

Case-insensitive substring matching via `func.lower(col) LIKE '%q%'`.
Callers pass the raw q; the repository owns the pattern shape.
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import and_, asc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian


class SearchRepository:
    @staticmethod
    async def find_students(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        q: str,
        academic_year: str,
        allowed_class_ids: Sequence[UUID] | None = None,
        guardian_id: UUID | None = None,
        limit: int = 8,
    ) -> list[tuple[Student, str | None]]:
        """Return `[(student, class_name), ...]` for matches within the school.

        Left-joins the current-year Active enrollment + class so a
        student without a class still surfaces for Admin/Parent (Class
        is NULL for them). Callers that require a class match — Deputy
        + Teacher — pass `allowed_class_ids`, which promotes the join
        into an effective inner filter via `IN (...)`.
        """
        like = f"%{q}%"
        stmt = (
            select(Student, Class.name)
            .outerjoin(
                Enrollment,
                and_(
                    Enrollment.student_id == Student.id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                ),
            )
            .outerjoin(Class, Class.id == Enrollment.class_id)
            .where(
                and_(
                    Student.school_id == school_id,
                    or_(
                        func.lower(Student.first_name).like(func.lower(like)),
                        func.lower(Student.last_name).like(func.lower(like)),
                        func.lower(Student.slug).like(func.lower(like)),
                    ),
                )
            )
        )

        if allowed_class_ids is not None:
            if not allowed_class_ids:
                return []
            stmt = stmt.where(Enrollment.class_id.in_(list(allowed_class_ids)))

        if guardian_id is not None:
            stmt = stmt.join(
                StudentGuardian,
                StudentGuardian.student_id == Student.id,
            ).where(StudentGuardian.guardian_id == guardian_id)

        stmt = stmt.order_by(asc(Student.last_name), asc(Student.id)).limit(limit)
        result = (await session.execute(stmt)).all()
        return [(student, class_name) for student, class_name in result]

    @staticmethod
    async def find_staff(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        q: str,
        allowed_division: str | None = None,
        limit: int = 8,
    ) -> list[Staff]:
        like = f"%{q}%"
        stmt = select(Staff).where(
            and_(
                Staff.school_id == school_id,
                or_(
                    func.lower(Staff.first_name).like(func.lower(like)),
                    func.lower(Staff.last_name).like(func.lower(like)),
                    func.lower(Staff.slug).like(func.lower(like)),
                    func.lower(Staff.email).like(func.lower(like)),
                ),
            )
        )
        if allowed_division is not None:
            stmt = stmt.where(Staff.division == allowed_division)
        stmt = stmt.order_by(asc(Staff.last_name), asc(Staff.id)).limit(limit)
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def find_classes(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        q: str,
        allowed_division: str | None = None,
        limit: int = 8,
    ) -> list[Class]:
        like = f"%{q}%"
        stmt = select(Class).where(
            and_(
                Class.school_id == school_id,
                or_(
                    func.lower(Class.name).like(func.lower(like)),
                    func.lower(Class.slug).like(func.lower(like)),
                ),
            )
        )
        if allowed_division is not None:
            stmt = stmt.where(Class.division == allowed_division)
        stmt = stmt.order_by(asc(Class.name), asc(Class.id)).limit(limit)
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def division_class_ids(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        academic_year: str,
        division: str,
    ) -> list[UUID]:
        stmt = select(Class.id).where(
            and_(
                Class.school_id == school_id,
                Class.academic_year == academic_year,
                Class.division == division,
            )
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def teacher_class_ids(
        session: AsyncSession,
        *,
        staff_id: UUID,
        academic_year: str,
    ) -> list[UUID]:
        """Every current-year class the staff member is on — as class
        teacher or subject teacher. Deduplicated across the two junction
        tables."""
        from app.features.classes.model import ClassSubject, ClassTeacher

        ct_stmt = (
            select(ClassTeacher.class_id)
            .join(Class, Class.id == ClassTeacher.class_id)
            .where(
                and_(
                    ClassTeacher.staff_id == staff_id,
                    Class.academic_year == academic_year,
                )
            )
        )
        cs_stmt = (
            select(ClassSubject.class_id)
            .join(Class, Class.id == ClassSubject.class_id)
            .where(
                and_(
                    ClassSubject.teacher_id == staff_id,
                    Class.academic_year == academic_year,
                )
            )
        )
        ct_ids = set((await session.execute(ct_stmt)).scalars())
        cs_ids = set((await session.execute(cs_stmt)).scalars())
        return list(ct_ids | cs_ids)
