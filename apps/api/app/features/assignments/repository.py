"""Data-access layer for Assignments.

Read paths always join teacher + subject + class so `AssignmentRead` has
its display fields without follow-up queries.
"""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import and_, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.assignments.model import Assignment
from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE as ENROLLMENT_ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.features.users.model import User


class AssignmentsRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        teacher_id: UUID | str | None = None,
        status: str | None = None,
        class_id: UUID | str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Assignment, Staff, Subject, Class]], int]:
        """List with joined teacher + subject + class. Soft-deleted
        rows excluded. Newest-first (by `updated_at`)."""
        where = [
            Assignment.school_id == school_id,
            Assignment.deleted_at.is_(None),
        ]
        if teacher_id:
            where.append(Assignment.teacher_id == teacher_id)
        if status:
            where.append(Assignment.status == status)
        if class_id:
            where.append(Assignment.class_id == class_id)

        where_clause = and_(*where)

        count_stmt = select(func.count(Assignment.id)).where(where_clause)
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(Assignment, Staff, Subject, Class)
            .join(Staff, Staff.id == Assignment.teacher_id)
            .join(Subject, Subject.id == Assignment.subject_id)
            .join(Class, Class.id == Assignment.class_id)
            .where(where_clause)
            .order_by(desc(Assignment.updated_at))
            .offset(offset)
            .limit(size)
        )
        rows = [(a, t, s, c) for a, t, s, c in (await session.execute(rows_stmt)).all()]
        return rows, total

    @staticmethod
    async def list_published_for_students(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        student_ids: Sequence[UUID | str],
        academic_year: str,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Assignment, Staff, Subject, Class]], int]:
        """Parent-facing read: given the parent's linked student IDs,
        return published assignments for the classes those students are
        currently enrolled in. Ordered by `due_date` (soonest first).

        Empty `student_ids` short-circuits — no query, empty page.
        """
        if not student_ids:
            return [], 0

        class_ids_subq = (
            select(Enrollment.class_id)
            .where(
                and_(
                    Enrollment.student_id.in_(list(student_ids)),
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == "Active",
                )
            )
            .distinct()
            .subquery()
        )

        where_clause = and_(
            Assignment.school_id == school_id,
            Assignment.deleted_at.is_(None),
            Assignment.status == "published",
            Assignment.class_id.in_(select(class_ids_subq.c.class_id)),
        )

        count_stmt = select(func.count(Assignment.id)).where(where_clause)
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(Assignment, Staff, Subject, Class)
            .join(Staff, Staff.id == Assignment.teacher_id)
            .join(Subject, Subject.id == Assignment.subject_id)
            .join(Class, Class.id == Assignment.class_id)
            .where(where_clause)
            .order_by(asc(Assignment.due_date))
            .offset(offset)
            .limit(size)
        )
        rows = [(a, t, s, c) for a, t, s, c in (await session.execute(rows_stmt)).all()]
        return rows, total

    @staticmethod
    async def list_primary_guardians_for_class(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        *,
        academic_year: str,
    ) -> list[tuple[Student, Guardian, User | None]]:
        """Every (student, primary guardian, guardian's app user if any)
        for active students enrolled in the given class this academic
        year — the fan-out list for `email/assignment-created.requested`
        + the in-app `ASSIGNMENT_CREATED` notification. Skips students
        with no primary guardian on file. Same join shape as
        `AttendanceRepository.list_primary_guardians_for_students`."""
        stmt = (
            select(Student, Guardian, User)
            .join(Enrollment, Enrollment.student_id == Student.id)
            .join(
                StudentGuardian,
                and_(
                    StudentGuardian.student_id == Student.id,
                    StudentGuardian.is_primary.is_(True),
                ),
            )
            .join(Guardian, Guardian.id == StudentGuardian.guardian_id)
            .outerjoin(User, User.linked_id == Guardian.id)
            .where(
                and_(
                    Student.school_id == school_id,
                    Enrollment.class_id == class_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ENROLLMENT_ACTIVE,
                )
            )
        )
        rows = (await session.execute(stmt)).all()
        return [(s, g, u) for s, g, u in rows]

    @staticmethod
    async def get_by_id(
        session: AsyncSession,
        school_id: UUID | str,
        assignment_id: UUID | str,
    ) -> tuple[Assignment, Staff, Subject, Class] | None:
        stmt = (
            select(Assignment, Staff, Subject, Class)
            .join(Staff, Staff.id == Assignment.teacher_id)
            .join(Subject, Subject.id == Assignment.subject_id)
            .join(Class, Class.id == Assignment.class_id)
            .where(
                and_(
                    Assignment.id == assignment_id,
                    Assignment.school_id == school_id,
                    Assignment.deleted_at.is_(None),
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1], row[2], row[3]) if row else None
