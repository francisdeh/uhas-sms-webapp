"""Appointment-requested teacher email.

Triggered by `email/appointment-requested.requested`, emitted from
`AppointmentsService._notify_appointment_channels` (called from
`.create`) only after both gates pass (school's
`notification_defaults.on_appointment_activity` + the teacher's own
`user_preferences.email_on_appointment_activity`) — gating and
recipient resolution happen at the emit site, not here, so this job
stays a pure "send what I'm told" handler, same division of labour as
`lesson_plans/jobs/rejection_email.py`.

Event payload shape:
    {
      "teacher_email": "...",
      "teacher_name": "...",
      "guardian_name": "...",
      "student_name": "...",
      "reason": "..." | "",
      "link": "/teacher/appointments",
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
    teacher_email = str(data["teacher_email"])
    teacher_name = str(data["teacher_name"])
    guardian_name = str(data["guardian_name"])
    student_name = str(data["student_name"])
    reason = str(data.get("reason") or "").strip()
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    reason_block = f"Reason given:\n{reason}\n\n" if reason else ""
    text = (
        f"Hi {teacher_name},\n\n"
        f"{guardian_name} would like to meet about {student_name}.\n\n"
        f"{reason_block}"
        f"Respond to the request:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "appointment_requested.html",
        teacher_name=teacher_name,
        guardian_name=guardian_name,
        student_name=student_name,
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
                to=teacher_email,
                subject="Appointment requested",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


appointment_requested_email_job = inngest_client.create_function(
    fn_id="appointment-requested-email",
    trigger=inngest.TriggerEvent(event="email/appointment-requested.requested"),
)(_run)
