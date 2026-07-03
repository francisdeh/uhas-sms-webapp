"""Data-access layer for the Classes domain (+ two junctions).

The class-subjects and class-teachers queries hand-join the display
fields (subject name, teacher name, staff name) so the router can
return one enriched shape per row — matches the UI's `ClassDetail`
that shows names, not just IDs.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Row, and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.staff.model import Staff
from app.features.subjects.model import Subject


class ClassesRepository:
    @staticmethod
    def _enriched_columns() -> tuple[Any, Any]:
        """Return the SELECT-list additions for the enriched list/detail query.

        These live as columns (not JOINed rows) so a class with 0 teachers
        + 0 enrollments still yields one row, correctly showing 0 / NULL.
        """
        # Active enrollments count for the class.
        student_count = (
            select(func.count(Enrollment.id))
            .where(
                and_(
                    Enrollment.class_id == Class.id,
                    Enrollment.status == ACTIVE,
                )
            )
            .correlate(Class)
            .scalar_subquery()
            .label("student_count")
        )
        # Primary class-teacher's name. Falls back to any teacher if no
        # `is_primary=true` row exists. Sorted so `is_primary=true` wins,
        # last_name breaks ties.
        primary_teacher_name = (
            select(func.concat(Staff.first_name, " ", Staff.last_name))
            .join(ClassTeacher, Staff.id == ClassTeacher.staff_id)
            .where(ClassTeacher.class_id == Class.id)
            .order_by(desc(ClassTeacher.is_primary), asc(Staff.last_name))
            .limit(1)
            .correlate(Class)
            .scalar_subquery()
            .label("primary_teacher_name")
        )
        return student_count, primary_teacher_name

    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        division: str | None = None,
        academic_year: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Class, int, str | None]], int]:
        """Return (rows, total) where each row is (Class, student_count, primary_teacher_name)."""
        where = [Class.school_id == school_id]
        if division:
            where.append(Class.division == division)
        if academic_year:
            where.append(Class.academic_year == academic_year)
        if q:
            like = f"%{q}%"
            where.append(
                or_(
                    func.lower(Class.name).like(func.lower(like)),
                    func.lower(Class.slug).like(func.lower(like)),
                )
            )

        where_clause = and_(*where)
        total = int(
            (await session.execute(select(func.count(Class.id)).where(where_clause))).scalar_one()
            or 0
        )

        student_count, primary_teacher_name = ClassesRepository._enriched_columns()
        offset = (page - 1) * size
        rows_stmt = (
            select(Class, student_count, primary_teacher_name)
            .where(where_clause)
            .order_by(asc(Class.academic_year), asc(Class.division), asc(Class.name))
            .offset(offset)
            .limit(size)
        )
        rows = [(c, int(sc or 0), tn) for c, sc, tn in (await session.execute(rows_stmt)).all()]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, class_id: UUID | str
    ) -> Class | None:
        """Bare class lookup — used internally where the enriched fields aren't needed."""
        stmt = select(Class).where(and_(Class.id == class_id, Class.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_enriched(
        session: AsyncSession, school_id: UUID | str, class_id: UUID | str
    ) -> tuple[Class, int, str | None] | None:
        """Class + student_count + primary_teacher_name — powers the detail page header."""
        student_count, primary_teacher_name = ClassesRepository._enriched_columns()
        stmt = select(Class, student_count, primary_teacher_name).where(
            and_(Class.id == class_id, Class.school_id == school_id)
        )
        row = (await session.execute(stmt)).first()
        if not row:
            return None
        cls, sc, tn = row
        return cls, int(sc or 0), tn

    @staticmethod
    async def find_by_slug(session: AsyncSession, school_id: UUID | str, slug: str) -> Class | None:
        """Per-school uniqueness — the DB constraint is `(school_id, slug)`.

        The convention (see seed data) is that each academic year uses a
        distinct slug — e.g. `class-jhs1` vs `class-jhs1-2027` — rather
        than the same slug across years.
        """
        stmt = select(Class).where(and_(Class.school_id == school_id, Class.slug == slug))
        return (await session.execute(stmt)).scalar_one_or_none()


class ClassSubjectsRepository:
    @staticmethod
    async def list_for_class(
        session: AsyncSession, class_id: UUID | str
    ) -> list[tuple[ClassSubject, Subject, Staff | None]]:
        """List subject assignments enriched with subject + teacher rows."""
        stmt = (
            select(ClassSubject, Subject, Staff)
            .join(Subject, Subject.id == ClassSubject.subject_id)
            .outerjoin(Staff, Staff.id == ClassSubject.teacher_id)
            .where(ClassSubject.class_id == class_id)
            .order_by(asc(Subject.name))
        )
        return [(cs, s, t) for cs, s, t in (await session.execute(stmt)).all()]

    @staticmethod
    async def get(
        session: AsyncSession, class_id: UUID | str, subject_id: UUID | str
    ) -> ClassSubject | None:
        stmt = select(ClassSubject).where(
            and_(
                ClassSubject.class_id == class_id,
                ClassSubject.subject_id == subject_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    def _lookup_columns() -> tuple[Any, ...]:
        """SELECT list for the inverse-lookup queries — one row per class_subject
        with the class + subject + teacher labels the response schema needs.
        """
        return (
            ClassSubject.class_id.label("class_id"),
            Class.name.label("class_name"),
            Class.slug.label("class_slug"),
            Class.division.label("division"),
            ClassSubject.subject_id.label("subject_id"),
            Subject.name.label("subject_name"),
            Subject.slug.label("subject_slug"),
            ClassSubject.teacher_id.label("teacher_id"),
            func.nullif(
                func.trim(
                    func.concat(
                        func.coalesce(Staff.first_name, ""),
                        " ",
                        func.coalesce(Staff.last_name, ""),
                    )
                ),
                "",
            ).label("teacher_name"),
        )

    @staticmethod
    async def find_class_subjects_by_subject(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        subject_id: UUID | str,
        limit: int = 200,
    ) -> list[Row[Any]]:
        """All `class_subjects` rows for a subject, scoped to the caller's school.

        The school-scope filter lives on `classes.school_id` — cheaper than
        joining `subjects` again and equally safe because a class_subjects
        row is per-class.
        """
        stmt = (
            select(*ClassSubjectsRepository._lookup_columns())
            .join(Class, Class.id == ClassSubject.class_id)
            .join(Subject, Subject.id == ClassSubject.subject_id)
            .outerjoin(Staff, Staff.id == ClassSubject.teacher_id)
            .where(
                and_(
                    ClassSubject.subject_id == subject_id,
                    Class.school_id == school_id,
                )
            )
            .order_by(asc(Class.division), asc(Class.name))
            .limit(limit)
        )
        return list((await session.execute(stmt)).all())

    @staticmethod
    async def find_class_subjects_by_teacher(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        teacher_id: UUID | str,
        limit: int = 200,
    ) -> list[Row[Any]]:
        """All `class_subjects` rows for a teacher, scoped to the caller's school."""
        stmt = (
            select(*ClassSubjectsRepository._lookup_columns())
            .join(Class, Class.id == ClassSubject.class_id)
            .join(Subject, Subject.id == ClassSubject.subject_id)
            .outerjoin(Staff, Staff.id == ClassSubject.teacher_id)
            .where(
                and_(
                    ClassSubject.teacher_id == teacher_id,
                    Class.school_id == school_id,
                )
            )
            .order_by(asc(Class.division), asc(Class.name), asc(Subject.name))
            .limit(limit)
        )
        return list((await session.execute(stmt)).all())


class ClassTeachersRepository:
    @staticmethod
    async def list_for_class(
        session: AsyncSession, class_id: UUID | str
    ) -> list[tuple[ClassTeacher, Staff]]:
        stmt = (
            select(ClassTeacher, Staff)
            .join(Staff, Staff.id == ClassTeacher.staff_id)
            .where(ClassTeacher.class_id == class_id)
            .order_by(desc(ClassTeacher.is_primary), asc(Staff.last_name))
        )
        return [(ct, s) for ct, s in (await session.execute(stmt)).all()]

    @staticmethod
    async def get(
        session: AsyncSession, class_id: UUID | str, staff_id: UUID | str
    ) -> ClassTeacher | None:
        stmt = select(ClassTeacher).where(
            and_(
                ClassTeacher.class_id == class_id,
                ClassTeacher.staff_id == staff_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()
