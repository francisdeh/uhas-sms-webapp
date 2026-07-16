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

from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentDocument, StudentGuardian
from app.features.users.model import User


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
        staff_child: bool = False,
    ) -> tuple[list[tuple[Student, Class | None]], int]:
        """Return ((Student, Class | None) rows, total).

        Left-joins the current-year Active enrollment + class. Students
        without an active enrollment for the year still appear (Class is
        NULL) — unless `division` is set, which forces the join.

        `staff_child=True` additionally joins `student_guardians` →
        `guardians` and keeps only students with a staff-backed guardian.
        A student can have up to two staff-backed guardians, so that join
        can fan out a row — `.distinct()` on both the rows and count
        queries keeps pagination correct.
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
        count_base: Any = (
            select(func.count(func.distinct(Student.id)))
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
        )

        if staff_child:
            base = (
                base.distinct()
                .join(StudentGuardian, StudentGuardian.student_id == Student.id)
                .join(Guardian, Guardian.id == StudentGuardian.guardian_id)
            )
            count_base = count_base.join(
                StudentGuardian, StudentGuardian.student_id == Student.id
            ).join(Guardian, Guardian.id == StudentGuardian.guardian_id)

        where = [Student.school_id == school_id]
        if active_only:
            where.append(Student.is_active.is_(True))
        if division:
            where.append(Class.division == division)
        if staff_child:
            where.append(Guardian.staff_id.isnot(None))
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

        count_stmt = count_base.where(where_clause)
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
    async def list_for_guardian(
        session: AsyncSession,
        school_id: UUID | str,
        guardian_id: UUID | str,
        *,
        academic_year: str,
    ) -> list[tuple[Student, Class | None, str | None]]:
        """Every student linked to this guardian, with current-year class.

        The third tuple element is set when a student has no active
        enrollment in `academic_year` but does have one in a later,
        already-prepared year (e.g. promoted via Promotions' `approve()`
        ahead of that year actually being activated) — the nearest such
        year, so the caller can show "JHS 2 (2026/2027)" instead of
        nothing during that transition window. `academic_year` strings
        sort lexicographically the same as chronologically (`"YYYY/YYYY"`,
        zero-padded), so a plain `>` comparison is safe.
        """
        base: Any = (
            select(Student, Class)
            .join(StudentGuardian, StudentGuardian.student_id == Student.id)
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
                    StudentGuardian.guardian_id == guardian_id,
                    Student.school_id == school_id,
                )
            )
            .order_by(asc(Student.last_name), asc(Student.id))
        )
        result = (await session.execute(base)).all()

        missing_ids = [s.id for s, c in result if c is None]
        fallback: dict[UUID, tuple[Class, str]] = {}
        if missing_ids:
            fallback_stmt = (
                select(Enrollment.student_id, Class, Enrollment.academic_year)
                .join(Class, Class.id == Enrollment.class_id)
                .where(
                    and_(
                        Enrollment.student_id.in_(missing_ids),
                        Enrollment.status == ACTIVE,
                        Enrollment.academic_year > academic_year,
                    )
                )
                .order_by(asc(Enrollment.student_id), asc(Enrollment.academic_year))
            )
            for student_id, cls, year in (await session.execute(fallback_stmt)).all():
                # First row per student_id (order_by above) is the
                # nearest future year — keep only that one.
                fallback.setdefault(student_id, (cls, year))

        rows: list[tuple[Student, Class | None, str | None]] = []
        for s, c in result:
            if c is not None:
                rows.append((s, c, None))
            elif s.id in fallback:
                fb_class, fb_year = fallback[s.id]
                rows.append((s, fb_class, fb_year))
            else:
                rows.append((s, None, None))
        return rows

    @staticmethod
    async def list_guardians(
        session: AsyncSession, school_id: UUID | str, student_id: UUID | str
    ) -> list[tuple[Guardian, str | None, bool, bool]]:
        """All guardians linked to a student — `(Guardian, relation,
        is_primary, has_login)`, primaries first then by surname.
        `has_login` is true when a `users` row links this guardian."""
        stmt = (
            select(
                Guardian,
                StudentGuardian.relation,
                StudentGuardian.is_primary,
                User.id.isnot(None),
            )
            .join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
            .outerjoin(User, User.linked_id == Guardian.id)
            .where(
                and_(
                    StudentGuardian.student_id == student_id,
                    Guardian.school_id == school_id,
                )
            )
            .order_by(desc(StudentGuardian.is_primary), asc(Guardian.last_name))
        )
        rows = (await session.execute(stmt)).all()
        return [(g, rel, bool(primary), bool(has_login)) for g, rel, primary, has_login in rows]

    @staticmethod
    async def get_link(
        session: AsyncSession, student_id: UUID | str, guardian_id: UUID | str
    ) -> StudentGuardian | None:
        stmt = select(StudentGuardian).where(
            and_(
                StudentGuardian.student_id == student_id,
                StudentGuardian.guardian_id == guardian_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def count_guardians(session: AsyncSession, student_id: UUID | str) -> int:
        stmt = select(func.count()).where(StudentGuardian.student_id == student_id)
        return int((await session.execute(stmt)).scalar_one() or 0)

    @staticmethod
    async def clear_primary_flags(
        session: AsyncSession, student_id: UUID | str, *, except_guardian_id: UUID | str
    ) -> None:
        """Unset `is_primary` on every OTHER guardian of the student — keeps
        at most one primary (display-only marker)."""
        links = (
            (
                await session.execute(
                    select(StudentGuardian).where(
                        and_(
                            StudentGuardian.student_id == student_id,
                            StudentGuardian.guardian_id != except_guardian_id,
                            StudentGuardian.is_primary.is_(True),
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        for link in links:
            link.is_primary = False

    @staticmethod
    async def list_siblings(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        academic_year: str,
    ) -> list[tuple[Student, Class | None]]:
        """Students who share at least one guardian with `student_id`,
        excluding the student itself, deduped, with current-year class."""
        shared_guardian_ids = select(StudentGuardian.guardian_id).where(
            StudentGuardian.student_id == student_id
        )
        stmt = (
            select(Student, Class)
            .distinct()
            .join(StudentGuardian, StudentGuardian.student_id == Student.id)
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
                    StudentGuardian.guardian_id.in_(shared_guardian_ids),
                    Student.id != student_id,
                    Student.school_id == school_id,
                )
            )
            .order_by(asc(Student.last_name), asc(Student.id))
        )
        rows = (await session.execute(stmt)).all()
        return [(s, c) for s, c in rows]

    @staticmethod
    async def list_documents(
        session: AsyncSession, student_id: UUID | str
    ) -> list[tuple[StudentDocument, Staff]]:
        stmt = (
            select(StudentDocument, Staff)
            .join(Staff, Staff.id == StudentDocument.uploaded_by_id)
            .where(StudentDocument.student_id == student_id)
            .order_by(desc(StudentDocument.created_at))
        )
        rows = (await session.execute(stmt)).all()
        return [(d, s) for d, s in rows]

    @staticmethod
    async def get_document(
        session: AsyncSession, school_id: UUID | str, document_id: UUID | str
    ) -> StudentDocument | None:
        stmt = select(StudentDocument).where(
            and_(StudentDocument.id == document_id, StudentDocument.school_id == school_id)
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def insert_document(session: AsyncSession, document: StudentDocument) -> StudentDocument:
        session.add(document)
        await session.flush()
        return document

    @staticmethod
    async def delete_document(session: AsyncSession, document: StudentDocument) -> None:
        await session.delete(document)
        await session.flush()

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
