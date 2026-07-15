"""SMS fan-out — one job run per batch of recipients.

Triggered by the `sms/fanout.requested` event. First real producer:
`UsersService._emit_onboarding_sms` (phone-only account creation). Per
the Phase 3 plan, wiring the remaining triggers — absence alerts,
results-published notices, announcement broadcast — into their
domains is deferred; this job is the shared mechanism each will call
into as they land.

Runs with its own DB session (`SessionLocal`) rather than FastAPI's
request-scoped `get_session` dependency — Inngest jobs execute outside
any HTTP request. Per the architecture doc, jobs use a service-role
connection and must not rely on request-scoped auth; tenancy comes
from the event payload's `school_id`, not a JWT.

Event payload shape:
    {
      "school_id": "<uuid>",
      "category": "absence" | "results" | "fee_reminder" | "announcement"
        | "onboarding" | "appointment" | "leave" | "assignment" | "other",
      "body": "<message text>",
      "recipients": [{"phone": "+233...", "guardian_id": "<uuid> | null"}, ...]
    }
"""

from __future__ import annotations

from typing import Any, TypedDict, cast

import inngest

from app.core.db import SessionLocal
from app.core.inngest import inngest_client, with_sentry
from app.features.sms.service import SmsService


class _Recipient(TypedDict):
    phone: str
    guardian_id: str | None


async def _send_one(school_id: str, category: str, body: str, recipient: _Recipient) -> str:
    async with SessionLocal() as session:
        row = await SmsService.send(
            session,
            school_id=school_id,
            recipient_phone=recipient["phone"],
            recipient_guardian_id=recipient.get("guardian_id"),
            category=category,  # type: ignore[arg-type]
            body=body,
        )
        await session.commit()
        return str(row.id)


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    school_id = str(data["school_id"])
    category = str(data["category"])
    body = str(data["body"])
    recipients = cast("list[_Recipient]", data["recipients"])

    sent_ids: list[str] = []
    for i, recipient in enumerate(recipients):
        step_id = f"send-{i}"

        async def _step(r: _Recipient = recipient) -> str:
            return await _send_one(school_id, category, body, r)

        sent_ids.append(await ctx.step.run(step_id, _step))

    return {"sent_count": len(sent_ids), "sms_log_ids": sent_ids}


sms_fanout_job = inngest_client.create_function(
    fn_id="sms-fanout",
    trigger=inngest.TriggerEvent(event="sms/fanout.requested"),
)(_run)
