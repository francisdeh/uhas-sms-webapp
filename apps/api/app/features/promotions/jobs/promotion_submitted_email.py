"""Promotion-list-submitted reviewer email.

Triggered by `email/promotion-submitted.requested`, emitted from
`promotions.service._notify_promotion_reviewers` (called from
`PromotionsService.submit_list`) once per resolved reviewer (Deputy
Head of the class's division or Admin), only after both gates pass
(school's `notification_defaults.on_promotion_activity` + that
reviewer's own `user_preferences.email_on_promotion_activity`) —
gating and recipient resolution happen at the emit site, so this job
stays a pure "send what I'm told" handler, same division of labour as
`leave_requests/jobs/leave_requested_email.py`.

Event payload shape:
    {
      "recipient_email": "...",
      "class_name": "...",
      "link": "/admin/promotions/{id}" | "/deputy-head/promotions/{id}",
      "school_name": "...",
      "school_address": "..." | "",
      "school_contact_email": "..." | "",
      "preferences_link": "/admin/profile?tab=notifications" | "/deputy-head/..."
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
        f"{class_name} submitted their promotion list for review.\n\n"
        f"Review the list:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "promotion_submitted.html",
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
                subject=f"Promotion list submitted: {class_name}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


promotion_submitted_email_job = inngest_client.create_function(
    fn_id="promotion-submitted-email",
    trigger=inngest.TriggerEvent(event="email/promotion-submitted.requested"),
)(_run)
