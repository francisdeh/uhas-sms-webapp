"""Registers every Inngest function in the lesson-plans domain."""

from __future__ import annotations

from app.features.lesson_plans.jobs.rejection_email import rejection_email_job

LESSON_PLANS_JOBS = [rejection_email_job]
