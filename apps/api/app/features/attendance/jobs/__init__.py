"""Registers every Inngest function in the attendance domain."""

from __future__ import annotations

from app.features.attendance.jobs.attendance_absent_email import attendance_absent_email_job

ATTENDANCE_JOBS = [
    attendance_absent_email_job,
]
