"""HTTP routes for the SMS domain.

  GET /sms-log?category=X&page=N&size=M

Read-only, Admin-only — a way to see what a "send" actually did while
the provider is the no-op-safe stub. Rows are written by
`SmsService.send(...)` from job/service code, never over HTTP.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.sms.constants import SmsCategory
from app.features.sms.schema import SmsLogListResponse, SmsLogRead
from app.features.sms.service import SmsService

router = APIRouter(prefix="/sms-log", tags=["sms"])


@router.get("", response_model=SmsLogListResponse, response_model_by_alias=True)
async def list_sms_log(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
    category: Annotated[SmsCategory | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> SmsLogListResponse:
    rows, total = await SmsService.list_for_school(
        session, school_id, category=category, page=page, size=size
    )
    return SmsLogListResponse(
        items=[SmsLogRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )
