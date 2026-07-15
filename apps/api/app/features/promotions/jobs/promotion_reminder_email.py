"""Promotion-list-still-pending teacher email.

Triggered by `email/promotion-reminder.requested`, emitted from
`promotions.service._notify_promotion_teacher` (called from the weekly
`PromotionsService.send_unsubmitted_reminders` job), only after both
gates pass (school's `notification_defaults.on_promotion_decided` +
the teacher's own `user_preferences.email_on_promotion_decided`) —
gating and recipient resolution happen at the emit site, so this job
stays a pure "send what I'm told" handler, same division of labour as
`leave_requests/jobs/leave_decided_email.py`.

Event payload shape:
    {
      "recipient_email": "...",
      "class_name": "...",
      "link": "/teacher/promotions/{class_id}",
      "school_name": "...",
      "school_address": "..." | "",
      "school_contact_email": "..." | "",
      "preferences_link": "/teacher/profile?tab=notifications"
    }
"""

from __future__ import annotations

from typing import Any

import inngest

from app.core.inngest import inngest_client, with_sentry
from app.integrations.email.provider import EmailMessage, app_url, get_email_provider
from app.integrations.email.templates import render_email_template


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    recipient_email = str(data["recipient_email"])
    class_name = str(data["class_name"])
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    text = (
        f"Hi,\n\n"
        f"{class_name}'s promotion list hasn't been submitted yet.\n\n"
        f"Submit now:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "promotion_reminder.html",
        class_name=class_name,
        link=link,
        school_name=school_name,
        school_address=school_address,
        school_contact_email=school_contact_email,
        preferences_link=preferences_link,
    )

    async def _send() -> dict[str, Any]:
        provider = get_email_provider()
        result = await provider.send(
            EmailMessage(
                to=recipient_email,
                subject=f"Promotion list still pending: {class_name}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


promotion_reminder_email_job = inngest_client.create_function(
    fn_id="promotion-reminder-email",
    trigger=inngest.TriggerEvent(event="email/promotion-reminder.requested"),
)(_run)
