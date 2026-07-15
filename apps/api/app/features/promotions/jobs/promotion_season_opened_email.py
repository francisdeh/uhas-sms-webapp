"""Promotion-season-opened teacher email.

Triggered by `email/promotion-season-opened.requested`, emitted from
`promotions.service._notify_promotion_season_opened` (called from
`PromotionsService.open_season`) once per teacher in the school, only
after both gates pass (school's `notification_defaults.on_promotion_season`
+ that teacher's own `user_preferences.email_on_promotion_season`) —
gating and recipient resolution happen at the emit site, so this job
stays a pure "send what I'm told" handler, same division of labour as
`schemes/jobs/scheme_submitted_email.py`.

Event payload shape:
    {
      "recipient_email": "...",
      "academic_year": "...",
      "link": "/teacher/promotions",
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
    academic_year = str(data["academic_year"])
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    text = (
        f"Hi,\n\n"
        f"Submit promotion decisions for your students in {academic_year}.\n\n"
        f"Go to Promotions:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "promotion_season_opened.html",
        academic_year=academic_year,
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
                subject="Promotion season opened",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


promotion_season_opened_email_job = inngest_client.create_function(
    fn_id="promotion-season-opened-email",
    trigger=inngest.TriggerEvent(event="email/promotion-season-opened.requested"),
)(_run)
