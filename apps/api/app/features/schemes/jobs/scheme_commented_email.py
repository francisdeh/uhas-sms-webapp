"""Scheme-comment email — shared by both comment directions.

Triggered by `email/scheme-commented.requested`, emitted from
`schemes.service._notify_scheme_unit_heads` (teacher commented, called
from `SchemesService.add_comment`) or `_notify_scheme_teacher`
(reviewer commented, same call site) — whichever direction, the
gating (school's `notification_defaults.on_scheme_{activity,decided}`
+ the recipient's own `user_preferences.{email}_on_scheme_{...}`) and
recipient resolution happen at the emit site, so this job stays a
pure "send what I'm told" handler regardless of who's on the other
end, same division of labour as
`leave_requests/jobs/leave_requested_email.py`.

Event payload shape:
    {
      "recipient_email": "...",
      "commenter_name": "..." (teacher's full name, or "A reviewer"),
      "scheme_title": "...",
      "class_name": "...",
      "comment": "...",
      "link": "/teacher/schemes",
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
    commenter_name = str(data["commenter_name"])
    scheme_title = str(data["scheme_title"])
    class_name = str(data["class_name"])
    comment = str(data.get("comment") or "").strip()
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    comment_block = f"Comment:\n{comment}\n\n" if comment else ""
    text = (
        f"Hi,\n\n"
        f"{commenter_name} commented on {scheme_title} for {class_name}.\n\n"
        f"{comment_block}"
        f"View the scheme:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "scheme_commented.html",
        commenter_name=commenter_name,
        scheme_title=scheme_title,
        class_name=class_name,
        comment=comment,
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
                subject=f"New comment on {scheme_title}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


scheme_commented_email_job = inngest_client.create_function(
    fn_id="scheme-commented-email",
    trigger=inngest.TriggerEvent(event="email/scheme-commented.requested"),
)(_run)
