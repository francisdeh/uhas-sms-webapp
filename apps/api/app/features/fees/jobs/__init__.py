"""Registers every Inngest function in the fees domain."""

from __future__ import annotations

from app.features.fees.jobs.fee_reminder import fee_reminder_job

FEES_JOBS = [fee_reminder_job]
