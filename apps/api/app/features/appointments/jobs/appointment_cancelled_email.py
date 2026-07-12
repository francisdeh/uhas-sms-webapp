"""Appointment-cancelled teacher email.

Triggered by `email/appointment-cancelled.requested`, emitted from
`AppointmentsService._notify_appointment_channels` (called from
`.cancel`) — same two-tier gate as the requested/decided jobs, reusing
the `"activity"` direction (request and cancel both mean "your
calendar changed"). Pure "send what I'm told" handler.

Event payload shape:
    {
      "teacher_email": "...",
      "teacher_name": "...",
      "guardian_name": "...",
      "student_name": "...",
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
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    text = (
        f"Hi {teacher_name},\n\n"
        f"{guardian_name} cancelled the meeting about {student_name}.\n\n"
        f"View your appointments:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "appointment_cancelled.html",
        teacher_name=teacher_name,
        guardian_name=guardian_name,
        student_name=student_name,
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
                subject="Appointment cancelled",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


appointment_cancelled_email_job = inngest_client.create_function(
    fn_id="appointment-cancelled-email",
    trigger=inngest.TriggerEvent(event="email/appointment-cancelled.requested"),
)(_run)
