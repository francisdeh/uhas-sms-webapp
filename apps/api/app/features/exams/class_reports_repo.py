"""Data-access layer for the class-report workflow.

Kept separate from `repository.py` so the scores grid queries stay
tight — the class-report reads pull from a different set of tables
(class_report_submissions, student_report_remarks, classes,
enrollments, students) and would otherwise crowd the scores repo.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.exams.model import ClassReportSubmission, StudentReportRemark
from app.features.students.model import Student


class ClassReportsRepository:
    @staticmethod
    async def find_report(
        session: AsyncSession,
        *,
        exam_id: UUID | str,
        class_id: UUID | str,
    ) -> ClassReportSubmission | None:
        stmt = select(ClassReportSubmission).where(
            and_(
                ClassReportSubmission.exam_id == exam_id,
                ClassReportSubmission.class_id == class_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def list_reports_for_exam(
        session: AsyncSession,
        *,
        exam_id: UUID | str,
        school_id: UUID | str,
        class_ids: list[UUID] | None = None,
    ) -> list[tuple[ClassReportSubmission | None, Class]]:
        """Every class in this school for this exam, with its report row
        if one exists. `class_ids`, when provided, narrows the roster —
        used to scope teachers to their own classes without leaking
        siblings.
        """
        cls_stmt = select(Class).where(Class.school_id == school_id)
        if class_ids is not None:
            if not class_ids:
                return []
            cls_stmt = cls_stmt.where(Class.id.in_(class_ids))
        cls_stmt = cls_stmt.order_by(asc(Class.division), asc(Class.name))
        classes = list((await session.execute(cls_stmt)).scalars().all())
        if not classes:
            return []

        rep_stmt = select(ClassReportSubmission).where(
            and_(
                ClassReportSubmission.exam_id == exam_id,
                ClassReportSubmission.class_id.in_([c.id for c in classes]),
            )
        )
        reports = {r.class_id: r for r in (await session.execute(rep_stmt)).scalars().all()}
        return [(reports.get(c.id), c) for c in classes]

    @staticmethod
    async def list_roster_with_remarks(
        session: AsyncSession,
        *,
        exam_id: UUID | str,
        class_id: UUID | str,
        academic_year: str,
    ) -> list[tuple[Student, StudentReportRemark | None]]:
        """Every active student in the class + their remark for this
        exam (or None). Rendered as blank rows on the frontend when the
        teacher hasn't written a remark yet."""
        stmt = (
            select(Student)
            .join(Enrollment, Enrollment.student_id == Student.id)
            .where(
                and_(
                    Enrollment.class_id == class_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE,
                    Student.is_active.is_(True),
                )
            )
            .order_by(asc(Student.last_name), asc(Student.first_name))
        )
        students = list((await session.execute(stmt)).scalars().all())
        if not students:
            return []
        student_ids = [s.id for s in students]
        remark_stmt = select(StudentReportRemark).where(
            and_(
                StudentReportRemark.exam_id == exam_id,
                StudentReportRemark.student_id.in_(student_ids),
            )
        )
        remarks = {r.student_id: r for r in (await session.execute(remark_stmt)).scalars().all()}
        return [(s, remarks.get(s.id)) for s in students]

    @staticmethod
    async def delete_remarks_for_exam_class(
        session: AsyncSession,
        *,
        exam_id: UUID | str,
        student_ids: list[UUID],
    ) -> None:
        """Blow away every remark row for (exam, student ∈ ids). Paired
        with an INSERT to make PUT /draft's `remarks` list authoritative."""
        if not student_ids:
            return
        await session.execute(
            delete(StudentReportRemark).where(
                and_(
                    StudentReportRemark.exam_id == exam_id,
                    StudentReportRemark.student_id.in_(student_ids),
                )
            )
        )

    @staticmethod
    async def is_class_teacher(
        session: AsyncSession,
        *,
        staff_id: UUID | str,
        class_id: UUID | str,
    ) -> bool:
        stmt = select(ClassTeacher).where(
            and_(
                ClassTeacher.class_id == class_id,
                ClassTeacher.staff_id == staff_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none() is not None

    @staticmethod
    async def classes_taught_by(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        staff_id: UUID | str,
    ) -> list[UUID]:
        stmt = (
            select(ClassTeacher.class_id)
            .join(Class, Class.id == ClassTeacher.class_id)
            .where(
                and_(
                    Class.school_id == school_id,
                    ClassTeacher.staff_id == staff_id,
                )
            )
        )
        return list((await session.execute(stmt)).scalars().all())
