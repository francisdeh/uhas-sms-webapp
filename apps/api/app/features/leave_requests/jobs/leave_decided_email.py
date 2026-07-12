"""Leave-request-decided requester email.

Triggered by `email/leave-decided.requested`, emitted from
`LeaveRequestsService.update_status` only after both gates pass
(school's `notification_defaults.on_leave_decided` + the requester's
own `user_preferences.email_on_leave_decided`). Pure "send what I'm
told" handler, same shape as
`appointments/jobs/appointment_decided_email.py`.

Event payload shape:
    {
      "requester_email": "...",
      "leave_type": "...",
      "start_date": "...",
      "end_date": "...",
      "action": "approved" | "rejected",
      "rejection_reason": "..." | "",
      "link": "/teacher/leave",
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
    requester_email = str(data["requester_email"])
    leave_type = str(data["leave_type"])
    start_date = str(data["start_date"])
    end_date = str(data["end_date"])
    action = str(data["action"])
    rejection_reason = str(data.get("rejection_reason") or "").strip()
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    reason_block = f'Reason given:\n"{rejection_reason}"\n\n' if rejection_reason else ""
    text = (
        f"Hi,\n\n"
        f"Your {leave_type} leave request ({start_date} to {end_date}) was {action}.\n\n"
        f"{reason_block}"
        f"View the request:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "leave_decided.html",
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        action=action,
        rejection_reason=rejection_reason,
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
                to=requester_email,
                subject=f"Leave request {action}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


leave_decided_email_job = inngest_client.create_function(
    fn_id="leave-decided-email",
    trigger=inngest.TriggerEvent(event="email/leave-decided.requested"),
)(_run)
