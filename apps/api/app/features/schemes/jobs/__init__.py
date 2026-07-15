"""Registers every Inngest function in the schemes domain."""

from __future__ import annotations

from app.features.schemes.jobs.scheme_acknowledged_email import scheme_acknowledged_email_job
from app.features.schemes.jobs.scheme_commented_email import scheme_commented_email_job
from app.features.schemes.jobs.scheme_submitted_email import scheme_submitted_email_job

SCHEMES_JOBS = [
    scheme_submitted_email_job,
    scheme_acknowledged_email_job,
    scheme_commented_email_job,
]
