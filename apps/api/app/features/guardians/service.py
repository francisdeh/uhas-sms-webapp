"""Business logic for the Guardians domain."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.slug import insert_with_sequential_slug, per_school_slug_resolver
from app.features.guardians.model import Guardian
from app.features.guardians.repository import GuardiansRepository
from app.features.guardians.schema import GuardianCreate, GuardianUpdate


class GuardiansService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[Guardian], int]:
        return await GuardiansRepository.list_for_school(
            session, school_id, q=q, page=page, size=size
        )

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, guardian_id: UUID | str
    ) -> Guardian:
        row = await GuardiansRepository.get_by_id(session, school_id, guardian_id)
        if not row:
            raise NotFoundError(f"Guardian {guardian_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: GuardianCreate,
    ) -> Guardian:
        existing = await GuardiansRepository.find_by_email_or_phone(
            session, school_id, email=payload.email, phone=payload.phone
        )
        if existing:
            raise ConflictError("A guardian with this email or phone already exists.")

        return await insert_with_sequential_slug(
            session,
            next_seq=per_school_slug_resolver(
                session, school_id, GuardiansRepository.next_slug_number
            ),
            build_slug=lambda n: f"GUARDIAN-{n:03d}",
            build_row=lambda slug: Guardian(
                slug=slug,
                school_id=school_id,
                first_name=payload.first_name,
                last_name=payload.last_name,
                email=payload.email,
                phone=payload.phone,
            ),
        )

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        guardian_id: UUID | str,
        payload: GuardianUpdate,
    ) -> Guardian:
        row = await GuardiansService.get(session, school_id, guardian_id)
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(row, field, value)
        await session.flush()
        return row
