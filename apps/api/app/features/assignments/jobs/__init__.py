"""Registers every Inngest function in the assignments domain."""

from __future__ import annotations

from app.features.assignments.jobs.assignment_created_email import assignment_created_email_job

ASSIGNMENTS_JOBS = [
    assignment_created_email_job,
]
