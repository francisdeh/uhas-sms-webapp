"""Registers every Inngest function in the leave-requests domain."""

from __future__ import annotations

from app.features.leave_requests.jobs.leave_decided_email import leave_decided_email_job
from app.features.leave_requests.jobs.leave_requested_email import leave_requested_email_job

LEAVE_REQUESTS_JOBS = [
    leave_requested_email_job,
    leave_decided_email_job,
]
