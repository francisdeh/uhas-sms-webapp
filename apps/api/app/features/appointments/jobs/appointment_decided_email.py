"""Appointment-decided guardian email.

Triggered by `email/appointment-decided.requested`, emitted from
`AppointmentsService._notify_appointment_channels` (called from
`.respond`) only after both gates pass (school's
`notification_defaults.on_appointment_decided` + the guardian's own
`user_preferences.email_on_appointment_decided`). Pure "send what I'm
told" handler, same shape as `lesson_plans/jobs/rejection_email.py`.

Event payload shape:
    {
      "guardian_email": "...",
      "teacher_name": "...",
      "student_name": "...",
      "action": "confirmed" | "declined",
      "response": "..." | "",
      "link": "/parent/appointments",
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
    teacher_name = str(data["teacher_name"])
    student_name = str(data["student_name"])
    action = str(data["action"])
    response = str(data.get("response") or "").strip()
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    response_block = f'Note from the teacher:\n"{response}"\n\n' if response else ""
    text = (
        f"Hi,\n\n"
        f"{teacher_name} {action} your meeting about {student_name}.\n\n"
        f"{response_block}"
        f"View the appointment:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "appointment_decided.html",
        teacher_name=teacher_name,
        student_name=student_name,
        action=action,
        response=response,
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
                subject=f"Appointment {action}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


appointment_decided_email_job = inngest_client.create_function(
    fn_id="appointment-decided-email",
    trigger=inngest.TriggerEvent(event="email/appointment-decided.requested"),
)(_run)
