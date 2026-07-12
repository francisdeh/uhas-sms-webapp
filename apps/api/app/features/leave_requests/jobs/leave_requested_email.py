"""Leave-request-submitted approver email.

Triggered by `email/leave-requested.requested`, emitted from
`LeaveRequestsService._notify_leave_approvers` (called from `.create`)
once per resolved approver (Admin or Deputy Head of the requester's
division), only after both gates pass (school's
`notification_defaults.on_leave_activity` + that approver's own
`user_preferences.email_on_leave_activity`) — gating and recipient
resolution happen at the emit site, not here, so this job stays a pure
"send what I'm told" handler, same division of labour as
`appointments/jobs/appointment_requested_email.py`.

Event payload shape:
    {
      "approver_email": "...",
      "requester_name": "...",
      "leave_type": "...",
      "start_date": "...",
      "end_date": "...",
      "reason": "..." | "",
      "link": "/admin/staff" | "/deputy-head/leave",
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
    approver_email = str(data["approver_email"])
    requester_name = str(data["requester_name"])
    leave_type = str(data["leave_type"])
    start_date = str(data["start_date"])
    end_date = str(data["end_date"])
    reason = str(data.get("reason") or "").strip()
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    reason_block = f"Reason given:\n{reason}\n\n" if reason else ""
    text = (
        f"Hi,\n\n"
        f"{requester_name} requested {leave_type} leave from {start_date} to {end_date}.\n\n"
        f"{reason_block}"
        f"Review the request:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "leave_requested.html",
        requester_name=requester_name,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
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
                to=approver_email,
                subject=f"Leave request from {requester_name}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


leave_requested_email_job = inngest_client.create_function(
    fn_id="leave-requested-email",
    trigger=inngest.TriggerEvent(event="email/leave-requested.requested"),
)(_run)
