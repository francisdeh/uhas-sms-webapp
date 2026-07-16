"""Pure data-access layer for the Staff domain.

No business rules here — just typed SQL. The service layer composes
these methods + applies invariants + writes audit rows.

`list_for_school` returns (rows, total) for offset-style pagination —
matches the standard `{ items, total, page, size }` envelope our
DataTable expects. See [docs/ENGINEERING-CONVENTIONS.md] §pagination.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.staff.model import Staff, StaffDocument, StaffQualification, StaffSubjectExpertise
from app.features.subjects.model import Subject


class StaffRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        page: int = 1,
        size: int = 50,
        active_only: bool = False,
    ) -> tuple[list[Staff], int]:
        """Return (rows, total) — `total` is the unpaged count.

        `q` does case-insensitive `LIKE %q%` across first/last/email/uhas_id.
        Sort order is `(last_name ASC, id ASC)`; pagination is OFFSET-based,
        offset = (page - 1) * size.
        """
        where = [Staff.school_id == school_id]
        if active_only:
            where.append(Staff.is_active.is_(True))
        if q:
            like = f"%{q}%"
            where.append(
                or_(
                    func.lower(Staff.first_name).like(func.lower(like)),
                    func.lower(Staff.last_name).like(func.lower(like)),
                    func.lower(Staff.email).like(func.lower(like)),
                    func.lower(Staff.uhas_id).like(func.lower(like)),
                )
            )

        where_clause = and_(*where)

        # Total first so the UI can render "Page 3 of N" without a second round trip.
        count_stmt = select(func.count(Staff.id)).where(where_clause)
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(Staff)
            .where(where_clause)
            .order_by(asc(Staff.last_name), asc(Staff.id))
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(rows_stmt)).scalars().all())
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, staff_id: UUID | str
    ) -> Staff | None:
        """Scoped-by-school fetch — never returns another school's staff."""
        stmt = select(Staff).where(and_(Staff.id == staff_id, Staff.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_by_email(
        session: AsyncSession, school_id: UUID | str, email: str
    ) -> Staff | None:
        """Used during create to dedupe — emails are per-school unique by
        convention (the UI's invite flow assumes this)."""
        stmt = select(Staff).where(and_(Staff.school_id == school_id, Staff.email == email))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_by_uhas_id(
        session: AsyncSession, uhas_id: str, *, exclude_staff_id: UUID | str | None = None
    ) -> Staff | None:
        """Used to dedupe before insert/update. Deliberately NOT scoped by
        `school_id` — `Staff.uhas_id`'s DB constraint is a plain column-
        level `unique=True`, global across every school, so the pre-check
        has to match that same scope or it'd miss a real collision."""
        conditions = [Staff.uhas_id == uhas_id]
        if exclude_staff_id is not None:
            conditions.append(Staff.id != exclude_staff_id)
        stmt = select(Staff).where(and_(*conditions))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def next_slug_number(
        session: AsyncSession, school_id: UUID | str, prefix: str = "STAFF-"
    ) -> int:
        """Compute the next slug sequence — `STAFF-001`, `STAFF-002`, …

        Reads the max numeric tail across the school's staff. Concurrent
        inserts could race; the per-school slug uniqueness constraint
        catches collisions, the service retries.
        """
        stmt = (
            select(Staff.slug)
            .where(and_(Staff.school_id == school_id, Staff.slug.like(f"{prefix}%")))
            .order_by(desc(Staff.slug))
            .limit(1)
        )
        last = (await session.execute(stmt)).scalar_one_or_none()
        if not last:
            return 1
        try:
            return int(last[len(prefix) :]) + 1
        except ValueError:
            # Edge case: slug doesn't end in digits (manually inserted) —
            # fall back to count + 1 so we don't crash.
            count_stmt = select(func.count(Staff.id)).where(Staff.school_id == school_id)
            return int((await session.execute(count_stmt)).scalar_one() or 0) + 1

    # ── subject expertise ───────────────────────────────────────────────

    @staticmethod
    async def list_subject_expertise(session: AsyncSession, staff_id: UUID | str) -> list[Subject]:
        stmt = (
            select(Subject)
            .join(StaffSubjectExpertise, StaffSubjectExpertise.subject_id == Subject.id)
            .where(StaffSubjectExpertise.staff_id == staff_id)
            .order_by(asc(Subject.name))
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def replace_subject_expertise(
        session: AsyncSession, staff_id: UUID | str, subject_ids: list[UUID]
    ) -> None:
        await session.execute(
            delete(StaffSubjectExpertise).where(StaffSubjectExpertise.staff_id == staff_id)
        )
        if subject_ids:
            session.add_all(
                [
                    StaffSubjectExpertise(staff_id=staff_id, subject_id=sid)
                    for sid in dict.fromkeys(subject_ids)  # de-dupe, keep order
                ]
            )
        await session.flush()

    # ── qualifications ───────────────────────────────────────────────────

    @staticmethod
    async def list_qualifications(
        session: AsyncSession, staff_id: UUID | str
    ) -> list[StaffQualification]:
        stmt = (
            select(StaffQualification)
            .where(StaffQualification.staff_id == staff_id)
            .order_by(desc(StaffQualification.created_at))
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def get_qualification(
        session: AsyncSession, school_id: UUID | str, qualification_id: UUID | str
    ) -> StaffQualification | None:
        stmt = select(StaffQualification).where(
            and_(
                StaffQualification.id == qualification_id,
                StaffQualification.school_id == school_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def insert_qualification(
        session: AsyncSession, qualification: StaffQualification
    ) -> StaffQualification:
        session.add(qualification)
        await session.flush()
        return qualification

    @staticmethod
    async def delete_qualification(
        session: AsyncSession, qualification: StaffQualification
    ) -> None:
        await session.delete(qualification)
        await session.flush()

    # ── documents ────────────────────────────────────────────────────────

    @staticmethod
    async def list_documents(
        session: AsyncSession, staff_id: UUID | str
    ) -> list[tuple[StaffDocument, Staff]]:
        stmt = (
            select(StaffDocument, Staff)
            .join(Staff, Staff.id == StaffDocument.uploaded_by_id)
            .where(StaffDocument.staff_id == staff_id)
            .order_by(desc(StaffDocument.created_at))
        )
        rows = (await session.execute(stmt)).all()
        return [(d, s) for d, s in rows]

    @staticmethod
    async def get_document(
        session: AsyncSession, school_id: UUID | str, document_id: UUID | str
    ) -> StaffDocument | None:
        stmt = select(StaffDocument).where(
            and_(StaffDocument.id == document_id, StaffDocument.school_id == school_id)
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def insert_document(session: AsyncSession, document: StaffDocument) -> StaffDocument:
        session.add(document)
        await session.flush()
        return document

    @staticmethod
    async def delete_document(session: AsyncSession, document: StaffDocument) -> None:
        await session.delete(document)
        await session.flush()
