"""Announcement-posted recipient email.

Triggered by `email/announcement-posted.requested`, emitted from
`announcements.service._notify_announcement_channels` (called from
`AnnouncementsService.create` via `_fan_out_notification`) once per
resolved recipient — staff or parent, depending on the post's audience
— only after the school-level `notification_defaults.on_announcement_posted`
gate (checked once, upstream of the whole fan-out) and, unless the post
is critical, that recipient's own `user_preferences.email_on_announcement_posted`.
A critical post bypasses the per-user preference but not the school
gate. Gating and recipient resolution happen entirely at the emit
site, so this job stays a pure "send what I'm told" handler, same
division of labour as every other domain's email job.

Event payload shape:
    {
      "recipient_email": "...",
      "title": "...",
      "body": "...",
      "is_critical": bool,
      "link": "/admin/announcements" | "/deputy-head/announcements"
              | "/teacher/announcements" | "/parent/announcements",
      "school_name": "...",
      "school_address": "..." | "",
      "school_contact_email": "..." | "",
      "preferences_link": "/<role>/profile?tab=notifications"
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
    title = str(data["title"])
    body = str(data["body"])
    is_critical = bool(data.get("is_critical", False))
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    subject = f"⚠ {title}" if is_critical else title
    critical_line = "CRITICAL ANNOUNCEMENT\n\n" if is_critical else ""
    text = (
        f"Hi,\n\n"
        f"{critical_line}"
        f"{title}\n\n"
        f"{body}\n\n"
        f"View announcement:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "announcement_posted.html",
        title=title,
        body=body,
        is_critical=is_critical,
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
                subject=subject,
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


announcement_posted_email_job = inngest_client.create_function(
    fn_id="announcement-posted-email",
    trigger=inngest.TriggerEvent(event="email/announcement-posted.requested"),
)(_run)
