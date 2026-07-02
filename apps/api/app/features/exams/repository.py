"""Data-access layer for Exams + Scores."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.exams.model import Exam, Score
from app.features.students.model import Student
from app.features.subjects.model import Subject


class ExamsRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        academic_year: str | None = None,
        term: int | None = None,
        exam_type: str | None = None,
        published: bool | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[Exam], int]:
        where = [Exam.school_id == school_id]
        if academic_year:
            where.append(Exam.academic_year == academic_year)
        if term is not None:
            where.append(Exam.term == term)
        if exam_type:
            where.append(Exam.type == exam_type)
        if published is not None:
            where.append(Exam.is_published.is_(published))
        if q:
            like = f"%{q}%"
            where.append(func.lower(Exam.name).like(func.lower(like)))

        where_clause = and_(*where)
        total = int(
            (await session.execute(select(func.count(Exam.id)).where(where_clause))).scalar_one()
            or 0
        )

        offset = (page - 1) * size
        rows_stmt = (
            select(Exam)
            .where(where_clause)
            .order_by(
                desc(Exam.academic_year),
                desc(Exam.term),
                asc(Exam.type),
                asc(Exam.created_at),
            )
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(rows_stmt)).scalars().all())
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, exam_id: UUID | str
    ) -> Exam | None:
        stmt = select(Exam).where(and_(Exam.id == exam_id, Exam.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_by_natural_key(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        name: str,
        academic_year: str,
        term: int,
        exam_type: str,
    ) -> Exam | None:
        """Duplicate-check on create — `(school, name, year, term, type)`."""
        stmt = select(Exam).where(
            and_(
                Exam.school_id == school_id,
                Exam.name == name,
                Exam.academic_year == academic_year,
                Exam.term == term,
                Exam.type == exam_type,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()


class ScoresRepository:
    @staticmethod
    async def list_class_roster(
        session: AsyncSession,
        class_id: UUID | str,
        academic_year: str,
    ) -> list[Student]:
        """Active enrollments in `class_id` for `academic_year` → students,
        sorted by last name for the grid UI."""
        stmt = (
            select(Student)
            .join(Enrollment, Enrollment.student_id == Student.id)
            .where(
                and_(
                    Enrollment.class_id == class_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                )
            )
            .order_by(asc(Student.last_name), asc(Student.first_name))
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def list_grid(
        session: AsyncSession,
        *,
        exam_id: UUID | str,
        class_id: UUID | str,
        subject_id: UUID | str,
        academic_year: str,
    ) -> list[tuple[Student, Subject, Score | None]]:
        """Return one tuple per student in the class — `Score` is None
        when this student hasn't been graded for this subject yet."""
        subject = (
            await session.execute(select(Subject).where(Subject.id == subject_id))
        ).scalar_one_or_none()
        if not subject:
            return []

        students = await ScoresRepository.list_class_roster(session, class_id, academic_year)
        if not students:
            return []

        # Fetch every existing score row for (exam, subject) in one shot
        # and stitch by student_id.
        student_ids = [s.id for s in students]
        stmt = select(Score).where(
            and_(
                Score.exam_id == exam_id,
                Score.subject_id == subject_id,
                Score.student_id.in_(student_ids),
            )
        )
        scores = {sc.student_id: sc for sc in (await session.execute(stmt)).scalars().all()}
        return [(s, subject, scores.get(s.id)) for s in students]

    @staticmethod
    async def list_for_ranking(
        session: AsyncSession,
        *,
        exam_id: UUID | str,
        subject_id: UUID | str,
        student_ids: list[UUID],
    ) -> list[Score]:
        """Every persisted score in this (exam, subject) group whose
        student is in the given class roster — used to recompute
        positions after a save."""
        if not student_ids:
            return []
        stmt = select(Score).where(
            and_(
                Score.exam_id == exam_id,
                Score.subject_id == subject_id,
                Score.student_id.in_(student_ids),
            )
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def find_row(
        session: AsyncSession,
        *,
        exam_id: UUID | str,
        student_id: UUID | str,
        subject_id: UUID | str,
    ) -> Score | None:
        stmt = select(Score).where(
            and_(
                Score.exam_id == exam_id,
                Score.student_id == student_id,
                Score.subject_id == subject_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def enrollments_for_students(
        session: AsyncSession,
        *,
        class_id: UUID | str,
        academic_year: str,
        student_ids: list[UUID],
    ) -> set[UUID]:
        """Set of `student_id`s who are actively enrolled in `class_id` for
        `academic_year` — the batch validator gates payload rows against
        this."""
        if not student_ids:
            return set()
        stmt = select(Enrollment.student_id).where(
            and_(
                Enrollment.class_id == class_id,
                Enrollment.academic_year == academic_year,
                Enrollment.status == ACTIVE,
                Enrollment.student_id.in_(student_ids),
            )
        )
        return {row for row in (await session.execute(stmt)).scalars().all()}
