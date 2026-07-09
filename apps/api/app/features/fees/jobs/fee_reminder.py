"""Weekly overdue-fee SMS reminder — Phase 5 slice 3.

First cron-triggered Inngest job in this codebase (every other job is
`inngest.TriggerEvent`-triggered). Runs with its own DB session
(`SessionLocal`), same as `sms_fanout.py` — Inngest jobs execute
outside any HTTP request, so there's no request-scoped `get_session` or
JWT to resolve a school from. Sweeps every active school rather than
taking one in an event payload, since nothing schedules this — it's
purely time-triggered.

The actual eligibility/idempotency/messaging logic lives in
`FeesService.send_overdue_reminders` (fully covered by
`app/features/fees/tests/test_reminders.py` via the normal rollback-
isolated `db_session` fixture); this job is a thin per-school wrapper,
same division of labour as `sms_fanout.py`'s `_send_one` vs.
`SmsService.send`.
"""

from __future__ import annotations

from typing import Any

import inngest

from app.core.db import SessionLocal
from app.core.inngest import inngest_client, with_sentry
from app.features.fees.service import FeesService
from app.features.schools.repository import SchoolsRepository


async def _remind_one_school(school_id: str) -> int:
    async with SessionLocal() as session:
        count = await FeesService.send_overdue_reminders(session, school_id)
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


fee_reminder_job = inngest_client.create_function(
    fn_id="fee-reminder-weekly",
    # Mondays 07:00 UTC — GMT year-round in Ghana (no DST), so this is a
    # consistent 07:00 local start-of-week reminder.
    trigger=inngest.TriggerCron(cron="0 7 * * 1"),
)(_run)
