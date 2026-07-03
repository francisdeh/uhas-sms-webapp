"""Data-access for the Appointments domain.

Read paths join the three display entities (guardian, student, teacher)
so `AppointmentRead` has its display names without follow-up fetches.
The tricky query is `available_teachers_for_student` — it needs a
union of class_teachers + class_subjects for the student's current
active class.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.features.appointments.constants import CLASS_TEACHER_SENTINEL, PENDING
from app.features.appointments.model import Appointment
from app.features.classes.model import ClassSubject, ClassTeacher
from app.features.enrollments.constants import ACTIVE as ENROLLMENT_ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject


class AppointmentsRepository:
    # ─── Read paths ────────────────────────────────────────────────────

    @staticmethod
    async def list_for_guardian(
        session: AsyncSession,
        school_id: UUID | str,
        guardian_id: UUID | str,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Appointment, Guardian, Student, Staff]], int]:
        """A parent's own appointments, newest-first."""
        return await AppointmentsRepository._list(
            session,
            school_id,
            where=Appointment.guardian_id == guardian_id,
            page=page,
            size=size,
            pending_first=False,
        )

    @staticmethod
    async def list_for_teacher(
        session: AsyncSession,
        school_id: UUID | str,
        teacher_id: UUID | str,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Appointment, Guardian, Student, Staff]], int]:
        """A teacher's inbox — pending first, then newest."""
        return await AppointmentsRepository._list(
            session,
            school_id,
            where=Appointment.teacher_id == teacher_id,
            page=page,
            size=size,
            pending_first=True,
        )

    @staticmethod
    async def _list(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        where: ColumnElement[bool],
        page: int,
        size: int,
        pending_first: bool,
    ) -> tuple[list[tuple[Appointment, Guardian, Student, Staff]], int]:
        base_where = and_(Appointment.school_id == school_id, where)

        total = int(
            (
                await session.execute(select(func.count(Appointment.id)).where(base_where))
            ).scalar_one()
            or 0
        )

        offset = (page - 1) * size
        stmt = (
            select(Appointment, Guardian, Student, Staff)
            .join(Guardian, Guardian.id == Appointment.guardian_id)
            .join(Student, Student.id == Appointment.student_id)
            .join(Staff, Staff.id == Appointment.teacher_id)
            .where(base_where)
        )
        if pending_first:
            # SQL `CASE` puts pending at the top and everything else
            # sorted by created_at DESC. One trip; no Python re-sort.
            stmt = stmt.order_by(
                case((Appointment.status == PENDING, 0), else_=1),
                desc(Appointment.created_at),
            )
        else:
            stmt = stmt.order_by(desc(Appointment.created_at))
        stmt = stmt.offset(offset).limit(size)

        rows = [(a, g, s, t) for a, g, s, t in (await session.execute(stmt)).all()]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession,
        school_id: UUID | str,
        appointment_id: UUID | str,
    ) -> tuple[Appointment, Guardian, Student, Staff] | None:
        stmt = (
            select(Appointment, Guardian, Student, Staff)
            .join(Guardian, Guardian.id == Appointment.guardian_id)
            .join(Student, Student.id == Appointment.student_id)
            .join(Staff, Staff.id == Appointment.teacher_id)
            .where(
                and_(
                    Appointment.id == appointment_id,
                    Appointment.school_id == school_id,
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1], row[2], row[3]) if row else None

    # ─── Guardian / teacher validation joins ──────────────────────────

    @staticmethod
    async def guardian_owns_student(
        session: AsyncSession,
        *,
        guardian_id: UUID | str,
        student_id: UUID | str,
    ) -> bool:
        stmt = select(StudentGuardian.student_id).where(
            and_(
                StudentGuardian.guardian_id == guardian_id,
                StudentGuardian.student_id == student_id,
            )
        )
        return (await session.execute(stmt)).first() is not None

    @staticmethod
    async def teacher_teaches_student(
        session: AsyncSession,
        *,
        teacher_id: UUID | str,
        student_id: UUID | str,
        academic_year: str,
    ) -> bool:
        """True if the teacher is either the class teacher or a subject
        teacher for the class the student is currently active in.

        One query using `EXISTS` — cheaper than two round trips just to
        prove a teacher-student link."""
        class_ids_subq = (
            select(Enrollment.class_id)
            .where(
                and_(
                    Enrollment.student_id == student_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ENROLLMENT_ACTIVE,
                )
            )
            .scalar_subquery()
        )
        ct_stmt = select(ClassTeacher.class_id).where(
            and_(
                ClassTeacher.staff_id == teacher_id,
                ClassTeacher.class_id.in_(class_ids_subq),
            )
        )
        cs_stmt = select(ClassSubject.class_id).where(
            and_(
                ClassSubject.teacher_id == teacher_id,
                ClassSubject.class_id.in_(class_ids_subq),
            )
        )
        stmt = ct_stmt.union(cs_stmt)
        return (await session.execute(stmt)).first() is not None

    @staticmethod
    async def teachers_for_student(
        session: AsyncSession,
        student_id: UUID | str,
        *,
        academic_year: str,
    ) -> list[tuple[Staff, list[str]]]:
        """Returns `(staff, [subject_name, ...])` for every teacher who
        teaches the given student's current class. Class teachers get
        the `CLASS_TEACHER_SENTINEL` marker; subject teachers get their
        subject names. Both are deduped per teacher.

        Sorted by teacher name so the FE picker doesn't need a re-sort.
        """
        enrolment = (
            await session.execute(
                select(Enrollment.class_id).where(
                    and_(
                        Enrollment.student_id == student_id,
                        Enrollment.academic_year == academic_year,
                        Enrollment.status == ENROLLMENT_ACTIVE,
                    )
                )
            )
        ).scalar_one_or_none()
        if enrolment is None:
            return []

        # Class teachers — pull each with the `Class Teacher` sentinel.
        ct_rows = list(
            (
                await session.execute(
                    select(Staff)
                    .join(ClassTeacher, ClassTeacher.staff_id == Staff.id)
                    .where(ClassTeacher.class_id == enrolment)
                    .order_by(asc(Staff.first_name), asc(Staff.last_name))
                )
            ).scalars()
        )

        # Subject teachers — join to subject for the display name; drop
        # rows where the subject has no assigned teacher (nullable FK).
        cs_rows = list(
            (
                await session.execute(
                    select(Staff, Subject.name)
                    .join(ClassSubject, ClassSubject.teacher_id == Staff.id)
                    .join(Subject, Subject.id == ClassSubject.subject_id)
                    .where(
                        and_(
                            ClassSubject.class_id == enrolment,
                            ClassSubject.teacher_id.is_not(None),
                        )
                    )
                )
            ).all()
        )

        by_teacher: dict[str, tuple[Staff, list[str]]] = {}
        for staff in ct_rows:
            by_teacher[str(staff.id)] = (staff, [CLASS_TEACHER_SENTINEL])
        for staff, subject_name in cs_rows:
            key = str(staff.id)
            existing = by_teacher.get(key)
            if existing is None:
                by_teacher[key] = (staff, [subject_name])
            elif subject_name not in existing[1]:
                existing[1].append(subject_name)

        result = list(by_teacher.values())
        result.sort(key=lambda pair: f"{pair[0].first_name} {pair[0].last_name}")
        return result
