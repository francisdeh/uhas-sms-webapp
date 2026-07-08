"""Business logic for the Students domain.

Two non-trivial flows:

  - **create**: in one transaction — insert the Student row + a matching
    Enrollment row for the current academic year. Slug is
    `UHAS-YYYY-NNNN` keyed off the academic year's *starting* calendar
    year (so a student admitted Sept 2025 and one admitted Jan 2026 —
    same AY 2025/2026 — share the prefix `UHAS-2025-`).
  - **update**: writes a `STUDENT_EDIT` audit row when anything actually
    changes — captures field-level before/after for accountability.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT
from app.core.security import CurrentUser
from app.core.slug import insert_with_sequential_slug
from app.features.audit.actions import GUARDIAN_LINKED, GUARDIAN_UNLINKED, STUDENT_EDIT
from app.features.audit.service import write_audit_log
from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.guardians.service import GuardiansService
from app.features.schools.repository import SchoolsRepository
from app.features.staff.repository import StaffRepository
from app.features.students.model import Student, StudentGuardian
from app.features.students.repository import StudentsRepository
from app.features.students.schema import (
    StudentCreate,
    StudentGuardianAddRequest,
    StudentGuardianUpdateRequest,
    StudentUpdate,
)

MAX_GUARDIANS_PER_STUDENT = 2


async def _academic_year(session: AsyncSession, school_id: UUID | str) -> str:
    """Read the school's configured academic year (e.g. `2025/2026`)."""
    school = await SchoolsRepository.get_by_id(session, school_id)
    if not school:
        raise NotFoundError(f"School {school_id!r} not found.")
    return school.academic_year


def _slug_prefix_for_year(academic_year: str) -> str:
    """Slug prefix is the academic year's *start* calendar year.

    `"2025/2026"` → `"UHAS-2025-"`. Same prefix for every student
    admitted into that academic year regardless of enrolment month —
    so report cards in Term 2 (Jan-Apr) share the slug family with
    students who enrolled in Term 1 (Sept-Dec) of the same AY.
    """
    start_year = academic_year.split("/", 1)[0]
    return f"UHAS-{start_year}-"


async def _assert_can_view_student(
    session: AsyncSession,
    school_id: UUID | str,
    user: CurrentUser,
    cls: Class | None,
) -> None:
    """Read gate for a student's guardian/sibling data: Admin sees any;
    a Deputy Head only within their own division. (Teacher/parent access
    is a later slice.)"""
    if user.role == ADMIN:
        return
    if user.role == DEPUTY_HEAD and user.linked_id and cls is not None:
        staff = await StaffRepository.get_by_id(session, school_id, user.linked_id)
        if staff and staff.division == cls.division:
            return
    raise ForbiddenError("You may only view students in your own division.")


class StudentsService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        page: int = 1,
        size: int = 50,
        division: str | None = None,
        active_only: bool = False,
    ) -> tuple[list[tuple[Student, Class | None]], int]:
        year = await _academic_year(session, school_id)
        return await StudentsRepository.list_for_school(
            session,
            school_id,
            academic_year=year,
            q=q,
            page=page,
            size=size,
            division=division,
            active_only=active_only,
        )

    @staticmethod
    async def list_for_guardian(
        session: AsyncSession,
        school_id: UUID | str,
        guardian_id: UUID | str,
        *,
        user: CurrentUser,
    ) -> list[tuple[Student, Class | None]]:
        """Every child linked to `guardian_id`. A Parent may only look up
        their own linked guardian row — every other role can look up any
        guardian, matching the existing open-read posture on `/guardians`."""
        if user.role == PARENT and str(guardian_id) != str(user.linked_id):
            raise ForbiddenError("You may only view your own children.")
        year = await _academic_year(session, school_id)
        return await StudentsRepository.list_for_guardian(
            session, school_id, guardian_id, academic_year=year
        )

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, student_id: UUID | str
    ) -> tuple[Student, Class | None]:
        year = await _academic_year(session, school_id)
        row = await StudentsRepository.get_by_id(session, school_id, student_id, academic_year=year)
        if not row:
            raise NotFoundError(f"Student {student_id!r} not found.")
        return row

    @staticmethod
    async def get_primary_guardian(
        session: AsyncSession, school_id: UUID | str, student_id: UUID | str
    ) -> tuple[Any, str | None] | None:
        """First linked guardian for a student, or `None`. Read-open to any
        authenticated user in the school — matches `/students/{id}` and
        `/guardians/{id}`, which carry the same posture."""
        return await StudentsRepository.get_primary_guardian(session, school_id, student_id)

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: StudentCreate,
    ) -> tuple[Student, Class | None]:
        """Insert Student + initial Enrollment in one transaction."""
        cls = await StudentsRepository.find_class(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Invalid classId: class not found in this school.")

        year = await _academic_year(session, school_id)
        prefix = _slug_prefix_for_year(year)

        async def _next_seq() -> int:
            return await StudentsRepository.next_slug_number(session, school_id, prefix)

        student = await insert_with_sequential_slug(
            session,
            next_seq=_next_seq,
            build_slug=lambda n: f"{prefix}{n:04d}",
            build_row=lambda slug: Student(
                slug=slug,
                school_id=school_id,
                first_name=payload.first_name,
                middle_name=payload.middle_name,
                last_name=payload.last_name,
                dob=payload.dob,
                gender=payload.gender,
                phone=payload.phone,
                address=payload.address,
                nationality=payload.nationality,
                religion=payload.religion,
                photo_url=payload.photo_url,
                is_active=True,
            ),
        )

        enrollment = Enrollment(
            student_id=student.id,
            class_id=cls.id,
            academic_year=year,
            status=ACTIVE,
            enrollment_date=datetime.now(UTC).date(),
        )
        session.add(enrollment)
        await session.flush()

        for guardian_req in payload.guardians:
            await StudentsService._attach_guardian(session, school_id, student.id, guardian_req)

        return student, cls

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        payload: StudentUpdate,
        *,
        actor_user_id: UUID | str,
    ) -> tuple[Student, Class | None]:
        """Partial update + STUDENT_EDIT audit row when anything changes."""
        student, cls = await StudentsService.get(session, school_id, student_id)

        before_snapshot: dict[str, object | None] = {}
        after_snapshot: dict[str, object | None] = {}
        changes = payload.model_dump(exclude_unset=True)
        for field, new_value in changes.items():
            old_value = getattr(student, field)
            if old_value != new_value:
                before_snapshot[field] = old_value
                after_snapshot[field] = new_value
                setattr(student, field, new_value)

        if before_snapshot:
            await write_audit_log(
                session,
                school_id=school_id,
                user_id=actor_user_id,
                action=STUDENT_EDIT,
                target_table="students",
                target_id=student.id,
                before=before_snapshot,
                after=after_snapshot,
            )
        await session.flush()
        return student, cls

    # ── Guardian links ───────────────────────────────────────────────────────

    @staticmethod
    async def _attach_guardian(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        req: StudentGuardianAddRequest,
    ) -> Guardian:
        """Link an existing guardian or create + link a new one. Enforces
        the max-two cap and keeps at most one primary. No audit — callers
        that need it wrap this."""
        count = await StudentsRepository.count_guardians(session, student_id)
        if count >= MAX_GUARDIANS_PER_STUDENT:
            raise ConflictError("A student can have at most two guardians.")

        if req.guardian_id is not None:
            guardian = await GuardiansService.get(session, school_id, req.guardian_id)
            if await StudentsRepository.get_link(session, student_id, guardian.id):
                raise ConflictError("This guardian is already linked to the student.")
        else:
            assert req.new_guardian is not None  # guaranteed by the schema validator
            guardian = await GuardiansService.create(session, school_id, req.new_guardian)

        session.add(
            StudentGuardian(
                student_id=student_id,
                guardian_id=guardian.id,
                relation=req.relation,
                is_primary=req.is_primary,
            )
        )
        await session.flush()
        if req.is_primary:
            await StudentsRepository.clear_primary_flags(
                session, student_id, except_guardian_id=guardian.id
            )
            await session.flush()
        return guardian

    @staticmethod
    async def list_guardians(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        user: CurrentUser,
    ) -> list[tuple[Guardian, str | None, bool]]:
        _student, cls = await StudentsService.get(session, school_id, student_id)
        await _assert_can_view_student(session, school_id, user, cls)
        return await StudentsRepository.list_guardians(session, school_id, student_id)

    @staticmethod
    async def add_guardian(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        payload: StudentGuardianAddRequest,
        *,
        actor_user_id: UUID | str,
    ) -> list[tuple[Guardian, str | None, bool]]:
        await StudentsService.get(session, school_id, student_id)  # 404 if missing
        guardian = await StudentsService._attach_guardian(session, school_id, student_id, payload)
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=GUARDIAN_LINKED,
            target_table="student_guardians",
            target_id=student_id,
            before=None,
            after={
                "guardianId": str(guardian.id),
                "relation": payload.relation,
                "isPrimary": payload.is_primary,
            },
        )
        return await StudentsRepository.list_guardians(session, school_id, student_id)

    @staticmethod
    async def update_guardian_link(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        guardian_id: UUID | str,
        payload: StudentGuardianUpdateRequest,
    ) -> list[tuple[Guardian, str | None, bool]]:
        await StudentsService.get(session, school_id, student_id)  # 404 if missing
        link = await StudentsRepository.get_link(session, student_id, guardian_id)
        if link is None:
            raise NotFoundError("This guardian is not linked to the student.")
        if payload.relation is not None:
            link.relation = payload.relation
        if payload.is_primary is not None:
            link.is_primary = payload.is_primary
        await session.flush()
        if payload.is_primary:
            await StudentsRepository.clear_primary_flags(
                session, student_id, except_guardian_id=guardian_id
            )
            await session.flush()
        return await StudentsRepository.list_guardians(session, school_id, student_id)

    @staticmethod
    async def remove_guardian(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        guardian_id: UUID | str,
        *,
        actor_user_id: UUID | str,
    ) -> list[tuple[Guardian, str | None, bool]]:
        await StudentsService.get(session, school_id, student_id)  # 404 if missing
        link = await StudentsRepository.get_link(session, student_id, guardian_id)
        if link is None:
            raise NotFoundError("This guardian is not linked to the student.")
        await session.delete(link)
        await session.flush()
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=GUARDIAN_UNLINKED,
            target_table="student_guardians",
            target_id=student_id,
            before={"guardianId": str(guardian_id)},
            after=None,
        )
        return await StudentsRepository.list_guardians(session, school_id, student_id)

    @staticmethod
    async def list_siblings(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        user: CurrentUser,
    ) -> list[tuple[Student, Class | None]]:
        _student, cls = await StudentsService.get(session, school_id, student_id)
        await _assert_can_view_student(session, school_id, user, cls)
        year = await _academic_year(session, school_id)
        return await StudentsRepository.list_siblings(
            session, school_id, student_id, academic_year=year
        )

    @staticmethod
    async def set_active(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        active: bool,
    ) -> tuple[Student, Class | None]:
        student, cls = await StudentsService.get(session, school_id, student_id)
        if student.is_active == active:
            raise ConflictError(f"Student is already {'active' if active else 'inactive'}.")
        student.is_active = active
        await session.flush()
        return student, cls
