"""Business logic for the Enrollments domain.

Two flows this service handles today:

  - **enroll**: creates a fresh Active enrollment for a student in a
    class for the current academic year. Rejects duplicates
    (one Active per student per year) with 409.
  - **change_status**: narrow transition endpoint. Full promotion
    (Active → Repeating + close-out + open next-year Active) lives in
    the promotions service (Phase 2 #8) — this endpoint is the low-
    level primitive it composes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT, TEACHER
from app.core.security import CurrentUser
from app.features.audit.actions import ENROLLMENT_STATUS_CHANGED, ENROLLMENT_TRANSFERRED
from app.features.audit.service import write_audit_log
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.classes.repository import ClassesRepository
from app.features.classes.service import ClassesService
from app.features.enrollments.constants import ACTIVE, WITHDRAWN
from app.features.enrollments.model import Enrollment
from app.features.enrollments.repository import EnrollmentsRepository
from app.features.enrollments.schema import EnrollmentCreate, EnrollmentStatusUpdate
from app.features.schools.repository import SchoolsRepository
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.students.repository import StudentsRepository


async def _academic_year(session: AsyncSession, school_id: UUID | str) -> str:
    school = await SchoolsRepository.get_by_id(session, school_id)
    if not school:
        raise NotFoundError(f"School {school_id!r} not found.")
    return school.academic_year


async def _assert_can_view_student_enrollments(
    session: AsyncSession,
    user: CurrentUser,
    *,
    school_id: UUID | str,
    student_id: UUID | str,
    academic_year: str,
) -> None:
    """Role gate for a student's enrollment history.

    * Admin — any student in the school.
    * Parent — must be linked via `student_guardians`.
    * Teacher — must class-teach or subject-teach the student's current
      (this academic year, Active) class.
    * DeputyHead — student's current class division must match theirs.

    Mirrors `AttendanceService._assert_can_view_student`'s shape.
    """
    role = user.role
    if role == ADMIN:
        return
    if role == PARENT:
        if not user.linked_id:
            raise ForbiddenError("Parent identity missing.")
        link = await session.scalar(
            select(StudentGuardian.student_id).where(
                and_(
                    StudentGuardian.student_id == student_id,
                    StudentGuardian.guardian_id == user.linked_id,
                )
            )
        )
        if link is None:
            raise ForbiddenError("You may only view your own children.")
        return
    if role == TEACHER:
        if not user.linked_id:
            raise ForbiddenError("Teacher identity missing.")
        class_ids_subq = select(Enrollment.class_id).where(
            and_(
                Enrollment.student_id == student_id,
                Enrollment.academic_year == academic_year,
                Enrollment.status == ACTIVE,
            )
        )
        ct_stmt = select(ClassTeacher.class_id).where(
            and_(
                ClassTeacher.staff_id == user.linked_id,
                ClassTeacher.class_id.in_(class_ids_subq),
            )
        )
        cs_stmt = select(ClassSubject.class_id).where(
            and_(
                ClassSubject.teacher_id == user.linked_id,
                ClassSubject.class_id.in_(class_ids_subq),
            )
        )
        found = (await session.execute(ct_stmt.union(cs_stmt))).first()
        if found is None:
            raise ForbiddenError("You may only view students you teach.")
        return
    if role == DEPUTY_HEAD:
        if not user.linked_id:
            raise ForbiddenError("Deputy identity missing.")
        deputy_division = await session.scalar(
            select(Staff.division).where(Staff.id == user.linked_id)
        )
        if deputy_division is None:
            raise ForbiddenError("Deputy has no assigned division.")
        student_divisions = list(
            (
                await session.execute(
                    select(Class.division)
                    .join(Enrollment, Enrollment.class_id == Class.id)
                    .where(
                        and_(
                            Enrollment.student_id == student_id,
                            Enrollment.academic_year == academic_year,
                            Enrollment.status == ACTIVE,
                        )
                    )
                )
            )
            .scalars()
            .all()
        )
        if deputy_division not in student_divisions:
            raise ForbiddenError("Student is not in your division.")
        return
    raise ForbiddenError("Not permitted.")


class EnrollmentsService:
    @staticmethod
    async def list_for_student(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        user: CurrentUser,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Enrollment, Class, Student]], int]:
        # 404 the parent so a bad student_id doesn't quietly return [].
        year = await _academic_year(session, school_id)
        student = await StudentsRepository.get_by_id(
            session, school_id, student_id, academic_year=year
        )
        if not student:
            raise NotFoundError(f"Student {student_id!r} not found.")
        await _assert_can_view_student_enrollments(
            session, user, school_id=school_id, student_id=student_id, academic_year=year
        )
        return await EnrollmentsRepository.list_for_student(
            session, school_id, student_id, page=page, size=size
        )

    @staticmethod
    async def list_for_class(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        user: CurrentUser,
        *,
        status: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Enrollment, Class, Student]], int]:
        cls = await ClassesRepository.get_by_id(session, school_id, class_id)
        if not cls:
            raise NotFoundError(f"Class {class_id!r} not found.")
        await ClassesService.assert_can_access_class(session, school_id, user, cls)
        return await EnrollmentsRepository.list_for_class(
            session, school_id, class_id, status=status, page=page, size=size
        )

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, enrollment_id: UUID | str
    ) -> tuple[Enrollment, Class, Student]:
        row = await EnrollmentsRepository.get_by_id(session, school_id, enrollment_id)
        if not row:
            raise NotFoundError(f"Enrollment {enrollment_id!r} not found.")
        return row

    @staticmethod
    async def enroll(
        session: AsyncSession,
        school_id: UUID | str,
        payload: EnrollmentCreate,
    ) -> tuple[Enrollment, Class, Student]:
        year = await _academic_year(session, school_id)

        # Validate student + class belong to this school.
        student_row = await StudentsRepository.get_by_id(
            session, school_id, payload.student_id, academic_year=year
        )
        if not student_row:
            raise ValidationError("Student not found in this school.")
        student, _ = student_row
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")

        existing = await EnrollmentsRepository.get_active_for_student(
            session, school_id, payload.student_id, year
        )
        if existing:
            raise ConflictError(
                f"Student already has an active enrollment in {year}.",
            )

        enrollment = Enrollment(
            student_id=payload.student_id,
            class_id=payload.class_id,
            academic_year=year,
            status=ACTIVE,
            enrollment_date=datetime.now(UTC).date(),
        )
        session.add(enrollment)
        await session.flush()
        return enrollment, cls, student

    @staticmethod
    async def transfer_student(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        new_class_id: UUID | str,
        *,
        actor_user_id: UUID | str,
    ) -> tuple[Enrollment, Class, Student]:
        """Move a student to a different class within the same academic
        year — closes their current Active enrollment (if any) and opens
        a new one, both inside this one request's transaction. Replaces
        a two-call client-orchestrated sequence (withdraw, then create)
        that could leave the student with no active enrollment anywhere
        if the second call failed after the first succeeded.
        """
        year = await _academic_year(session, school_id)

        student_row = await StudentsRepository.get_by_id(
            session, school_id, student_id, academic_year=year
        )
        if not student_row:
            raise ValidationError("Student not found in this school.")
        student, _ = student_row
        cls = await ClassesRepository.get_by_id(session, school_id, new_class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")

        current = await EnrollmentsRepository.get_active_for_student(
            session, school_id, student_id, year
        )
        before_class_id = None
        if current is not None:
            if str(current.class_id) == str(new_class_id):
                raise ConflictError("Student is already enrolled in this class.")
            before_class_id = current.class_id
            current.status = WITHDRAWN

        enrollment = Enrollment(
            student_id=student_id,
            class_id=new_class_id,
            academic_year=year,
            status=ACTIVE,
            enrollment_date=datetime.now(UTC).date(),
        )
        session.add(enrollment)
        await session.flush()
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=ENROLLMENT_TRANSFERRED,
            target_table="enrollments",
            target_id=student_id,
            before={"classId": str(before_class_id) if before_class_id else None},
            after={"classId": str(new_class_id)},
        )
        return enrollment, cls, student

    @staticmethod
    async def change_status(
        session: AsyncSession,
        school_id: UUID | str,
        enrollment_id: UUID | str,
        payload: EnrollmentStatusUpdate,
        *,
        actor_user_id: UUID | str,
    ) -> tuple[Enrollment, Class, Student]:
        enrollment, cls, student = await EnrollmentsService.get(session, school_id, enrollment_id)
        if enrollment.status == payload.status:
            raise ConflictError(f"Enrollment already has status {payload.status!r}.")
        before_status = enrollment.status
        enrollment.status = payload.status
        await session.flush()
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=ENROLLMENT_STATUS_CHANGED,
            target_table="enrollments",
            target_id=enrollment.id,
            before={"status": before_status},
            after={"status": payload.status},
        )
        return enrollment, cls, student
