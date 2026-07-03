"""Lesson-plan-rejection email — the one deferred trigger from Phase 2's
notification retrofit (see `docs/MIGRATION-CLEANUP.md` §C). Every other
in-app trigger landed with the Notifications domain; this one needed
Inngest + the email integration to exist first.

Triggered by `email/lesson-plan-rejected.requested`, emitted from
`LessonPlansService._fan_out_review_notification` only when
`school.notification_defaults.on_lesson_plan_rejected` is true — the
gating happens at the emit site, not here, so this job can stay a pure
"send what I'm told" handler.

Event payload shape:
    {
      "teacher_email": "...",
      "plan_topic": "...",
      "reviewer_name": "...",
      "comment": "..." | null,
      "link": "/teacher/lesson-plans/<id>"
    }
"""

from __future__ import annotations

from typing import Any

import inngest

from app.core.inngest import inngest_client, with_sentry
from app.integrations.email.provider import EmailMessage, app_url, get_email_provider


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    teacher_email = str(data["teacher_email"])
    plan_topic = str(data["plan_topic"])
    reviewer_name = str(data["reviewer_name"])
    comment = str(data["comment"]).strip() if data.get("comment") else ""
    link = app_url(str(data["link"]))

    comment_block = f"Reviewer's note:\n{comment}\n\n" if comment else ""
    text = (
        f"Hi,\n\n"
        f'Your lesson plan "{plan_topic}" was sent back by {reviewer_name} and needs changes.\n\n'
        f"{comment_block}"
        f"Open it to revise and resubmit:\n{link}\n\n"
        f"— UHAS SMS\n"
    )

    async def _send() -> dict[str, Any]:
        provider = get_email_provider()
        result = await provider.send(
            EmailMessage(
                to=teacher_email,
                subject=f"Lesson plan returned: {plan_topic}",
                text=text,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


rejection_email_job = inngest_client.create_function(
    fn_id="lesson-plan-rejection-email",
    trigger=inngest.TriggerEvent(event="email/lesson-plan-rejected.requested"),
)(_run)
