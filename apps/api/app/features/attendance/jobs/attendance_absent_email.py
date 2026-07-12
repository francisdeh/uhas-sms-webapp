"""Attendance-absence guardian email.

Triggered by `email/attendance-absent.requested`, emitted from
`AttendanceService._notify_attendance_absences` (called from
`.upsert_session`) only after both gates pass (school's
`notification_defaults.on_attendance_absent` + the guardian's own
`user_preferences.email_on_attendance_absent`) — gating, dedup (a
student only qualifies if their new status is "Absent" and their
previous status wasn't), and recipient batching (one event per
guardian, combining every one of their newly-absent children into a
single `student_names` string) all happen at the emit site, so this
job stays a pure "send what I'm told" handler, same division of
labour as `leave_requests/jobs/leave_requested_email.py`.

Event payload shape:
    {
      "guardian_email": "...",
      "student_names": "...",
      "was_were": "was" | "were",
      "date": "...",
      "link": "/parent/attendance",
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
    student_names = str(data["student_names"])
    was_were = str(data["was_were"])
    date = str(data["date"])
    link = app_url(str(data["link"]))
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")
    preferences_link = app_url(str(data["preferences_link"]))

    text = (
        f"Hi,\n\n"
        f"{student_names} {was_were} marked absent today ({date}).\n\n"
        f"View attendance:\n{link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "attendance_absent.html",
        student_names=student_names,
        was_were=was_were,
        date=date,
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
                subject=f"Attendance: {student_names} marked absent",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


attendance_absent_email_job = inngest_client.create_function(
    fn_id="attendance-absent-email",
    trigger=inngest.TriggerEvent(event="email/attendance-absent.requested"),
)(_run)
