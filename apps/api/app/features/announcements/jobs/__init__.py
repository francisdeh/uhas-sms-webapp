"""Registers every Inngest function in the announcements domain."""

from __future__ import annotations

from app.features.announcements.jobs.announcement_posted_email import (
    announcement_posted_email_job,
)

ANNOUNCEMENTS_JOBS = [
    announcement_posted_email_job,
]
