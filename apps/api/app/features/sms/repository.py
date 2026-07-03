"""Data-access for the SMS domain — write on send, read for admin visibility."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.sms.constants import SmsCategory, SmsProviderName
from app.features.sms.model import SmsLog


class SmsRepository:
    @staticmethod
    async def insert(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        recipient_phone: str,
        recipient_guardian_id: UUID | str | None,
        category: SmsCategory,
        body: str,
        provider: SmsProviderName,
    ) -> SmsLog:
        """Write the `queued` row before the provider call — see the
        migration docstring for why write-then-send matters."""
        row = SmsLog(
            school_id=school_id,
            recipient_phone=recipient_phone,
            recipient_guardian_id=recipient_guardian_id,
            category=category,
            body=body,
            provider=provider,
            status="queued",
        )
        session.add(row)
        await session.flush()
        return row

    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        category: SmsCategory | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[SmsLog], int]:
        where = [SmsLog.school_id == school_id]
        if category:
            where.append(SmsLog.category == category)
        where_clause = and_(*where)

        count_stmt = select(func.count(SmsLog.id)).where(where_clause)
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(SmsLog)
            .where(where_clause)
            .order_by(desc(SmsLog.created_at), desc(SmsLog.id))
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(rows_stmt)).scalars().all())
        return rows, total
