"""Registers every Inngest function in the promotions domain."""

from __future__ import annotations

from app.features.promotions.jobs.season_reminder import promotion_season_reminder_job

PROMOTIONS_JOBS = [promotion_season_reminder_job]
