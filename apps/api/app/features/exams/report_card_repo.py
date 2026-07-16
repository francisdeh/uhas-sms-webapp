"""Data-access layer for the assembled report card.

Joins student → active enrollment → class → subjects/scores → class
teachers → class-report submission → per-student remark → school. Kept
separate from `class_reports_repo.py` because the report-card fetch is
read-only and hits a wider tuple of tables — mixing it into the class-
report queries would blur that boundary.

All methods take a session and return typed rows; the service composes
them into the response envelope.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class, ClassTeacher
from app.features.classes.repository import ClassesRepository
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.exams.model import (
    ClassReportSubmission,
    Exam,
    ReportCardBatchJob,
    Score,
    StudentReportRemark,
)
from app.features.school_terms.model import SchoolTerm
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject


class ReportCardRepository:
    @staticmethod
    async def load_student(
        session: AsyncSession, school_id: UUID | str, student_id: UUID | str
    ) -> Student | None:
        stmt = select(Student).where(and_(Student.id == student_id, Student.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def load_exam(
        session: AsyncSession, school_id: UUID | str, exam_id: UUID | str
    ) -> Exam | None:
        stmt = select(Exam).where(and_(Exam.id == exam_id, Exam.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def active_class_for(
        session: AsyncSession,
        *,
        student_id: UUID | str,
        academic_year: str,
    ) -> Class | None:
        """The class the student is actively enrolled in for the exam's
        academic year — that's the roster the report card sits inside."""
        stmt = (
            select(Class)
            .join(Enrollment, Enrollment.class_id == Class.id)
            .where(
                and_(
                    Enrollment.student_id == student_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                )
            )
            .limit(1)
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def count_active_enrollments_in_class(
        session: AsyncSession,
        *,
        class_id: UUID | str,
        academic_year: str,
    ) -> int:
        """ "Number on roll" — class size for the report card's info row."""
        stmt = (
            select(func.count())
            .select_from(Enrollment)
            .where(
                and_(
                    Enrollment.class_id == class_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                )
            )
        )
        return (await session.execute(stmt)).scalar_one()

    @staticmethod
    async def list_scored_rows(
        session: AsyncSession,
        *,
        student_id: UUID | str,
        exam_id: UUID | str,
    ) -> list[tuple[Score, Subject]]:
        """(score, subject) tuples where the student has any component
        entered — mirrors the TS "omit blank subjects" behaviour by
        filtering out fully-null rows here. Ordered alphabetically by
        subject name to match the printed layout."""
        stmt = (
            select(Score, Subject)
            .join(Subject, Subject.id == Score.subject_id)
            .where(
                and_(
                    Score.student_id == student_id,
                    Score.exam_id == exam_id,
                )
            )
            .order_by(asc(Subject.name))
        )
        rows = list((await session.execute(stmt)).all())
        return [
            (score, subject)
            for score, subject in rows
            if any(
                v is not None
                for v in (
                    score.cat1,
                    score.cat2,
                    score.project_work,
                    score.group_work,
                    score.exam_score,
                )
            )
        ]

    @staticmethod
    async def class_average_scores(
        session: AsyncSession,
        *,
        class_id: UUID | str,
        exam_id: UUID | str,
        academic_year: str,
    ) -> dict[UUID, float]:
        """subject_id -> average `total_score` across every actively-
        enrolled (this exam's academic year) student in the class with a
        non-null total_score for that subject. Powers the report card's
        "class avg" line — never null just because one student's own
        score is missing, only when nobody in the class has one."""
        stmt = (
            select(Score.subject_id, func.avg(Score.total_score))
            .join(Enrollment, Enrollment.student_id == Score.student_id)
            .where(
                and_(
                    Score.exam_id == exam_id,
                    Score.total_score.is_not(None),
                    Enrollment.class_id == class_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                )
            )
            .group_by(Score.subject_id)
        )
        rows = (await session.execute(stmt)).all()
        return {subject_id: float(avg) for subject_id, avg in rows}

    @staticmethod
    async def find_term(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        academic_year: str,
        term: int,
    ) -> SchoolTerm | None:
        """The `school_terms` row for one (school, year, term), or None if
        the school hasn't set that term's calendar. Drives the report
        card's vacation (this term's end) + reopening (next term's start)
        dates."""
        stmt = select(SchoolTerm).where(
            and_(
                SchoolTerm.school_id == school_id,
                SchoolTerm.academic_year == academic_year,
                SchoolTerm.term == term,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def list_class_teachers(session: AsyncSession, *, class_id: UUID | str) -> list[Staff]:
        stmt = (
            select(Staff)
            .join(ClassTeacher, ClassTeacher.staff_id == Staff.id)
            .where(ClassTeacher.class_id == class_id)
            .order_by(asc(Staff.last_name), asc(Staff.first_name))
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def find_report_submission(
        session: AsyncSession, *, exam_id: UUID | str, class_id: UUID | str
    ) -> ClassReportSubmission | None:
        stmt = select(ClassReportSubmission).where(
            and_(
                ClassReportSubmission.exam_id == exam_id,
                ClassReportSubmission.class_id == class_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_student_remark(
        session: AsyncSession, *, exam_id: UUID | str, student_id: UUID | str
    ) -> StudentReportRemark | None:
        stmt = select(StudentReportRemark).where(
            and_(
                StudentReportRemark.exam_id == exam_id,
                StudentReportRemark.student_id == student_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def is_parent_of(
        session: AsyncSession, *, guardian_id: UUID | str, student_id: UUID | str
    ) -> bool:
        stmt = select(StudentGuardian.student_id).where(
            and_(
                StudentGuardian.guardian_id == guardian_id,
                StudentGuardian.student_id == student_id,
            )
        )
        return (await session.execute(stmt)).first() is not None

    @staticmethod
    async def teaches_class(
        session: AsyncSession, *, staff_id: UUID | str, class_id: UUID | str
    ) -> bool:
        """True if the staff member class-teaches or subject-teaches
        `class_id`. Thin alias over the shared primitive in
        `ClassesRepository` — kept here too since call sites in this
        module already import `ReportCardRepository`."""
        return await ClassesRepository.staff_teaches_class(
            session, staff_id=staff_id, class_id=class_id
        )


class ReportCardBatchJobsRepository:
    @staticmethod
    async def create(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        exam_id: UUID | str,
        class_id: UUID | str,
        requested_by_staff_id: UUID | str,
    ) -> ReportCardBatchJob:
        row = ReportCardBatchJob(
            school_id=school_id,
            exam_id=exam_id,
            class_id=class_id,
            requested_by_staff_id=requested_by_staff_id,
        )
        session.add(row)
        await session.flush()
        return row

    @staticmethod
    async def find_latest(
        session: AsyncSession, *, school_id: UUID | str, exam_id: UUID | str, class_id: UUID | str
    ) -> ReportCardBatchJob | None:
        stmt = (
            select(ReportCardBatchJob)
            .where(
                and_(
                    ReportCardBatchJob.school_id == school_id,
                    ReportCardBatchJob.exam_id == exam_id,
                    ReportCardBatchJob.class_id == class_id,
                )
            )
            .order_by(ReportCardBatchJob.created_at.desc())
            .limit(1)
        )
        return (await session.execute(stmt)).scalar_one_or_none()
