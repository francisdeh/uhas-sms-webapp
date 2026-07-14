"""Business logic for the Classes domain + junctions."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Row
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.core.security import CurrentUser
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.classes.repository import (
    ClassesRepository,
    ClassSubjectsRepository,
    ClassTeachersRepository,
)
from app.features.classes.schema import (
    ClassCreate,
    ClassSubjectAssignRequest,
    ClassSubjectTeacherUpdate,
    ClassTeacherAssignRequest,
    ClassUpdate,
)
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository


class ClassesService:
    @staticmethod
    async def _deputy_division(
        session: AsyncSession, school_id: UUID | str, user: CurrentUser
    ) -> str:
        """Resolve the caller's own division — raises if their staff row
        is missing or has no division set (a half-configured account)."""
        if not user.linked_id:
            raise ForbiddenError("Deputy identity missing.")
        staff = await StaffRepository.get_by_id(session, school_id, user.linked_id)
        if staff is None or not staff.division:
            raise ForbiddenError("Your staff record has no division assigned.")
        return staff.division

    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        user: CurrentUser,
        *,
        q: str | None = None,
        division: str | None = None,
        academic_year: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Class, int, str | None]], int]:
        # A Deputy Head is scoped to their own division regardless of what
        # the query param asks for — never let `?division=` widen it.
        if user.role == DEPUTY_HEAD:
            division = await ClassesService._deputy_division(session, school_id, user)
        return await ClassesRepository.list_for_school(
            session,
            school_id,
            q=q,
            division=division,
            academic_year=academic_year,
            page=page,
            size=size,
        )

    @staticmethod
    async def get(session: AsyncSession, school_id: UUID | str, class_id: UUID | str) -> Class:
        """Bare class fetch — used internally where enrichment isn't needed."""
        row = await ClassesRepository.get_by_id(session, school_id, class_id)
        if not row:
            raise NotFoundError(f"Class {class_id!r} not found.")
        return row

    @staticmethod
    async def get_enriched(
        session: AsyncSession, school_id: UUID | str, class_id: UUID | str, user: CurrentUser
    ) -> tuple[Class, int, str | None]:
        """Class + student_count + primary_teacher_name — for the detail page."""
        row = await ClassesRepository.get_enriched(session, school_id, class_id)
        if not row:
            raise NotFoundError(f"Class {class_id!r} not found.")
        if user.role == DEPUTY_HEAD:
            own_division = await ClassesService._deputy_division(session, school_id, user)
            if row[0].division != own_division:
                raise ForbiddenError("You may only view classes in your division.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: ClassCreate,
    ) -> Class:
        # Slug is human-typed; lowercase for stable comparison. Uniqueness
        # is per-school (matches the `(school_id, slug)` DB constraint) —
        # convention is to give each academic year its own slug
        # (`class-jhs1` for 2025/2026, `class-jhs1-2027` for 2026/2027).
        canonical_slug = payload.slug.lower()

        existing = await ClassesRepository.find_by_slug(session, school_id, canonical_slug)
        if existing:
            raise ConflictError(f"Class with slug {canonical_slug!r} already exists.")

        row = Class(
            slug=canonical_slug,
            school_id=school_id,
            name=payload.name,
            division=payload.division,
            academic_year=payload.academic_year,
        )
        session.add(row)
        try:
            await session.flush()
        except IntegrityError as err:
            await session.rollback()
            raise ConflictError("Class slug collision.") from err
        return row

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        payload: ClassUpdate,
    ) -> Class:
        row = await ClassesService.get(session, school_id, class_id)
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(row, field, value)
        await session.flush()
        return row

    @staticmethod
    def next_year_slug(
        current_slug: str, current_academic_year: str, next_academic_year: str
    ) -> str:
        """Derive next year's slug from this year's, per the seed-data
        convention (mirrors `computeSlug` in
        `apps/web/src/features/classes/components/ClassCreateForm.tsx`):
        a class's *first* year uses a bare slug (`class-jhs1`); every
        subsequent year appends `-{endYear}` (`class-jhs1-2027`).

        Strips the current year's own `-{endYear}` suffix first (if
        present) so rolling forward repeatedly doesn't stack suffixes.
        """
        _, current_end = current_academic_year.split("/")
        _, next_end = next_academic_year.split("/")
        base = current_slug
        suffix = f"-{current_end}"
        if base.endswith(suffix):
            base = base[: -len(suffix)]
        return f"{base}-{next_end}"


class ClassSubjectsService:
    @staticmethod
    async def list_for_class(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
    ) -> list[tuple[ClassSubject, Subject, Staff | None]]:
        # 404 the parent first so a caller with a bad class_id doesn't
        # get an empty list.
        await ClassesService.get(session, school_id, class_id)
        return await ClassSubjectsRepository.list_for_class(session, class_id)

    @staticmethod
    async def assign(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        payload: ClassSubjectAssignRequest,
    ) -> tuple[ClassSubject, Subject, Staff | None]:
        # Validate class + subject belong to this school; teacher too if given.
        await ClassesService.get(session, school_id, class_id)
        subject = await SubjectsRepository.get_by_id(session, school_id, payload.subject_id)
        if not subject:
            raise ValidationError("Subject not found in this school.")
        teacher: Staff | None = None
        if payload.teacher_id:
            teacher = await StaffRepository.get_by_id(session, school_id, payload.teacher_id)
            if not teacher:
                raise ValidationError("Teacher not found in this school.")

        existing = await ClassSubjectsRepository.get(session, class_id, payload.subject_id)
        if existing:
            raise ConflictError("Subject is already assigned to this class.")

        row = ClassSubject(
            class_id=class_id,
            subject_id=payload.subject_id,
            teacher_id=payload.teacher_id,
        )
        session.add(row)
        await session.flush()
        return row, subject, teacher

    @staticmethod
    async def set_teacher(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        subject_id: UUID | str,
        payload: ClassSubjectTeacherUpdate,
    ) -> tuple[ClassSubject, Subject, Staff | None]:
        await ClassesService.get(session, school_id, class_id)
        row = await ClassSubjectsRepository.get(session, class_id, subject_id)
        if not row:
            raise NotFoundError("Subject is not assigned to this class.")

        subject = await SubjectsRepository.get_by_id(session, school_id, subject_id)
        assert subject, "class_subjects references a subject that vanished"

        changes = payload.model_dump(exclude_unset=True)
        teacher: Staff | None = None
        if "teacher_id" in changes:
            if changes["teacher_id"]:
                teacher = await StaffRepository.get_by_id(session, school_id, changes["teacher_id"])
                if not teacher:
                    raise ValidationError("Teacher not found in this school.")
            row.teacher_id = changes["teacher_id"]
        elif row.teacher_id:
            teacher = await StaffRepository.get_by_id(session, school_id, row.teacher_id)

        await session.flush()
        return row, subject, teacher

    @staticmethod
    async def remove(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        subject_id: UUID | str,
    ) -> None:
        await ClassesService.get(session, school_id, class_id)
        row = await ClassSubjectsRepository.get(session, class_id, subject_id)
        if not row:
            raise NotFoundError("Subject is not assigned to this class.")
        await session.delete(row)
        await session.flush()

    @staticmethod
    async def list_class_subjects(
        session: AsyncSession,
        user: CurrentUser,
        *,
        subject_id: UUID | None,
        teacher_id: UUID | None,
    ) -> list[Row[Any]]:
        """Inverse lookup on `class_subjects` — by subject XOR by teacher.

        Role gates:
          - Admin / Deputy Head → either lookup, any id in-school.
          - Teacher → only `teacher_id == user.linked_id`; subject
            lookups are forbidden (teachers use the class-detail view,
            not the school-wide inventory).
          - Everyone else → forbidden.

        Raises `BadRequestError` (code `invalid_query`) if the caller
        passes both or neither of the mutually exclusive params.
        """
        if not user.school_id:
            raise ForbiddenError("Session is missing school scope.")
        if (subject_id is None) == (teacher_id is None):
            raise BadRequestError(
                "Pass exactly one of subjectId or teacherId.",
                code="invalid_query",
            )

        role = user.role
        if role in (ADMIN, DEPUTY_HEAD):
            pass
        elif role == TEACHER:
            if subject_id is not None:
                raise ForbiddenError("Teachers cannot list class-subjects by subjectId.")
            if not user.linked_id or str(teacher_id) != user.linked_id:
                raise ForbiddenError("Teachers can only list their own class-subjects.")
        else:
            raise ForbiddenError("This lookup is not available to your role.")

        if subject_id is not None:
            return await ClassSubjectsRepository.find_class_subjects_by_subject(
                session, school_id=user.school_id, subject_id=subject_id
            )
        assert teacher_id is not None
        return await ClassSubjectsRepository.find_class_subjects_by_teacher(
            session, school_id=user.school_id, teacher_id=teacher_id
        )


class ClassTeachersService:
    @staticmethod
    async def list_for_class(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
    ) -> list[tuple[ClassTeacher, Staff]]:
        await ClassesService.get(session, school_id, class_id)
        return await ClassTeachersRepository.list_for_class(session, class_id)

    @staticmethod
    async def assign(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        payload: ClassTeacherAssignRequest,
    ) -> tuple[ClassTeacher, Staff]:
        await ClassesService.get(session, school_id, class_id)
        staff = await StaffRepository.get_by_id(session, school_id, payload.staff_id)
        if not staff:
            raise ValidationError("Staff member not found in this school.")

        existing = await ClassTeachersRepository.get(session, class_id, payload.staff_id)
        if existing:
            raise ConflictError("Staff member is already assigned to this class.")

        row = ClassTeacher(
            class_id=class_id,
            staff_id=payload.staff_id,
            is_primary=payload.is_primary,
        )
        session.add(row)
        await session.flush()
        return row, staff

    @staticmethod
    async def remove(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        staff_id: UUID | str,
    ) -> None:
        await ClassesService.get(session, school_id, class_id)
        row = await ClassTeachersRepository.get(session, class_id, staff_id)
        if not row:
            raise NotFoundError("Staff member is not assigned to this class.")
        await session.delete(row)
        await session.flush()
