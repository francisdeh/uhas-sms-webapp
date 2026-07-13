"""Registers every Inngest function in the users/account-emails domain."""

from __future__ import annotations

from app.features.users.jobs.account_email_change import account_email_change_job
from app.features.users.jobs.account_invite_email import account_invite_email_job
from app.features.users.jobs.password_reset_email import password_reset_email_job

USERS_JOBS = [
    account_invite_email_job,
    password_reset_email_job,
    account_email_change_job,
]
