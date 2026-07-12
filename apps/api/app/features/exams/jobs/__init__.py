"""Registers every Inngest function in the exams domain."""

from __future__ import annotations

from app.features.exams.jobs.report_card_batch import report_card_batch_job
from app.features.exams.jobs.results_published_email import results_published_email_job

EXAMS_JOBS = [report_card_batch_job, results_published_email_job]
