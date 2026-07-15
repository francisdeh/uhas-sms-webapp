"""Weekly unsubmitted-promotion-list reminder.

Mirrors `fees/jobs/fee_reminder.py`'s shape exactly — same cron
schedule, same per-school step wrapper, own `SessionLocal` session
since Inngest jobs run outside any HTTP request.

The actual eligibility/idempotency/messaging logic lives in
`PromotionsService.send_unsubmitted_reminders`; this job is a thin
per-school wrapper.
"""

from __future__ import annotations

from typing import Any

import inngest

from app.core.db import SessionLocal
from app.core.inngest import inngest_client, with_sentry
from app.features.promotions.service import PromotionsService
from app.features.schools.repository import SchoolsRepository


async def _remind_one_school(school_id: str) -> int:
    async with SessionLocal() as session:
        count = await PromotionsService.send_unsubmitted_reminders(session, school_id)
        await session.commit()
        return count


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    async with SessionLocal() as session:
        school_ids = [str(sid) for sid in await SchoolsRepository.list_active_ids(session)]

    reminded_counts: dict[str, int] = {}
    for school_id in school_ids:

        async def _step(sid: str = school_id) -> int:
            return await _remind_one_school(sid)

        reminded_counts[school_id] = await ctx.step.run(f"remind-{school_id}", _step)

    return {"schools": len(school_ids), "reminded_by_school": reminded_counts}


promotion_season_reminder_job = inngest_client.create_function(
    fn_id="promotion-season-reminder-weekly",
    # Mondays 07:00 UTC — same slot as the fee reminder (GMT year-round
    # in Ghana, no DST, so this is a consistent 07:00 local start-of-week
    # nudge for any class still unsubmitted).
    trigger=inngest.TriggerCron(cron="0 7 * * 1"),
)(_run)
