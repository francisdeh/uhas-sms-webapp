"""Assignment-published guardian email.

Triggered by `email/assignment-created.requested`, emitted from
`assignments.service._notify_assignment_created` (called from
`AssignmentsService.publish`) only after both gates pass (school's
`notification_defaults.on_assignment_created` + the guardian's own
`user_preferences.email_on_assignment_created`) — gating, dedup (one
event per guardian, even if they have more than one child in the
class), and recipient resolution all happen at the emit site, so this
job stays a pure "send what I'm told" handler, same division of
labour as `attendance/jobs/attendance_absent_email.py`.

Event payload shape:
    {
      "guardian_email": "...",
      "title": "...",
      "class_name": "...",
      "due_note": "..." | "",
      "link": "/parent/assignments",
      "school_name": "...",
      "school_address": "..." | "",
      "school_contact_email": "..." | "",
      "preferences_link": "/parent/profile?tab=notifications"
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
    guardian_email = str(data["guardian_email"])
    title = str(data["title"])
    class_name = str(data["class_name"])
    due_note = str(data.get("due_note") or "")
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    text = (
        f"Hi,\n\n"
        f"A new assignment has been posted for {class_name}: {title}.{due_note}\n\n"
        f"View assignment:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "assignment_created.html",
        title=title,
        class_name=class_name,
        due_note=due_note,
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
                to=guardian_email,
                subject=f"New assignment: {title}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


assignment_created_email_job = inngest_client.create_function(
    fn_id="assignment-created-email",
    trigger=inngest.TriggerEvent(event="email/assignment-created.requested"),
)(_run)
