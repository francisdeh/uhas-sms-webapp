"""Registers every Inngest function in the promotions domain."""

from __future__ import annotations

from app.features.promotions.jobs.promotion_approved_email import promotion_approved_email_job
from app.features.promotions.jobs.promotion_reminder_email import promotion_reminder_email_job
from app.features.promotions.jobs.promotion_season_opened_email import (
    promotion_season_opened_email_job,
)
from app.features.promotions.jobs.promotion_sent_back_email import promotion_sent_back_email_job
from app.features.promotions.jobs.promotion_submitted_email import promotion_submitted_email_job
from app.features.promotions.jobs.season_reminder import promotion_season_reminder_job

PROMOTIONS_JOBS = [
    promotion_season_reminder_job,
    promotion_season_opened_email_job,
    promotion_submitted_email_job,
    promotion_sent_back_email_job,
    promotion_approved_email_job,
    promotion_reminder_email_job,
]
