"""Business logic for the Subjects domain.

Subjects are simple compared to People — no audit trail (curriculum
changes are rare + reviewable in git), no cross-entity invariants.
The only rule is per-school slug uniqueness (the DB constraint
enforces it; the service just wraps the collision in a nicer 409).
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository
from app.features.subjects.schema import SubjectCreate, SubjectUpdate


class SubjectsService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        division: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[Subject], int]:
        return await SubjectsRepository.list_for_school(
            session, school_id, q=q, division=division, page=page, size=size
        )

    @staticmethod
    async def get(session: AsyncSession, school_id: UUID | str, subject_id: UUID | str) -> Subject:
        row = await SubjectsRepository.get_by_id(session, school_id, subject_id)
        if not row:
            raise NotFoundError(f"Subject {subject_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: SubjectCreate,
    ) -> Subject:
        # Uppercase the slug — subject codes are canonically upper on
        # report cards + audit rows. Doing it here (not in the schema)
        # keeps the DB the source of truth.
        canonical_slug = payload.slug.upper()

        existing = await SubjectsRepository.find_by_slug(session, school_id, canonical_slug)
        if existing:
            raise ConflictError(f"Subject with slug {canonical_slug!r} already exists.")

        row = Subject(
            slug=canonical_slug,
            school_id=school_id,
            name=payload.name,
            division=payload.division,
            category=payload.category or "Core",
        )
        session.add(row)
        try:
            await session.flush()
        except IntegrityError as err:
            await session.rollback()
            raise ConflictError("Subject slug collision.") from err
        return row

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        subject_id: UUID | str,
        payload: SubjectUpdate,
    ) -> Subject:
        row = await SubjectsService.get(session, school_id, subject_id)
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(row, field, value)
        await session.flush()
        return row
