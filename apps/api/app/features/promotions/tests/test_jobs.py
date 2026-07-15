"""Tests for the 5 promotion email jobs — pure "send what I'm told"
handlers, no DB access, same coverage shape as
`schemes/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.promotions.jobs import PROMOTIONS_JOBS
from app.features.promotions.jobs.promotion_approved_email import promotion_approved_email_job
from app.features.promotions.jobs.promotion_reminder_email import promotion_reminder_email_job
from app.features.promotions.jobs.promotion_season_opened_email import (
    promotion_season_opened_email_job,
)
from app.features.promotions.jobs.promotion_sent_back_email import promotion_sent_back_email_job
from app.features.promotions.jobs.promotion_submitted_email import promotion_submitted_email_job
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_jobs_are_registered() -> None:
    assert promotion_season_opened_email_job in PROMOTIONS_JOBS
    assert promotion_submitted_email_job in PROMOTIONS_JOBS
    assert promotion_sent_back_email_job in PROMOTIONS_JOBS
    assert promotion_approved_email_job in PROMOTIONS_JOBS
    assert promotion_reminder_email_job in PROMOTIONS_JOBS
    assert promotion_season_opened_email_job.id == "uhas-sms-api-promotion-season-opened-email"
    assert promotion_submitted_email_job.id == "uhas-sms-api-promotion-submitted-email"
    assert promotion_sent_back_email_job.id == "uhas-sms-api-promotion-sent-back-email"
    assert promotion_approved_email_job.id == "uhas-sms-api-promotion-approved-email"
    assert promotion_reminder_email_job.id == "uhas-sms-api-promotion-reminder-email"


def _fake_provider(sent: list[EmailMessage]) -> object:
    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    return _FakeProvider()


def test_season_opened_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        "app.features.promotions.jobs.promotion_season_opened_email.get_email_provider",
        lambda: _fake_provider(sent),
    )

    event = inngest.Event(
        name="email/promotion-season-opened.requested",
        data={
            "recipient_email": "teacher@uhas.edu.gh",
            "academic_year": "2025/2026",
            "link": "/teacher/promotions",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(promotion_season_opened_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "teacher@uhas.edu.gh"
    assert sent[0].subject == "Promotion season opened"
    assert "2025/2026" in sent[0].text


def test_submitted_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        "app.features.promotions.jobs.promotion_submitted_email.get_email_provider",
        lambda: _fake_provider(sent),
    )

    event = inngest.Event(
        name="email/promotion-submitted.requested",
        data={
            "recipient_email": "deputy@uhas.edu.gh",
            "class_name": "JHS 1",
            "link": "/deputy-head/promotions/abc",
            "preferences_link": "/deputy-head/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(promotion_submitted_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "deputy@uhas.edu.gh"
    assert sent[0].subject == "Promotion list submitted: JHS 1"


def test_sent_back_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        "app.features.promotions.jobs.promotion_sent_back_email.get_email_provider",
        lambda: _fake_provider(sent),
    )

    event = inngest.Event(
        name="email/promotion-sent-back.requested",
        data={
            "recipient_email": "teacher@uhas.edu.gh",
            "class_name": "JHS 1",
            "comment": "Check student 1 scores again.",
            "link": "/teacher/promotions/abc",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(promotion_sent_back_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert "Check student 1 scores again." in sent[0].text
    assert sent[0].html is not None
    assert "Check student 1 scores again." in sent[0].html


def test_approved_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        "app.features.promotions.jobs.promotion_approved_email.get_email_provider",
        lambda: _fake_provider(sent),
    )

    event = inngest.Event(
        name="email/promotion-approved.requested",
        data={
            "recipient_email": "teacher@uhas.edu.gh",
            "class_name": "JHS 1",
            "link": "/teacher/promotions/abc",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(promotion_approved_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].subject == "Promotion list approved: JHS 1"


def test_reminder_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        "app.features.promotions.jobs.promotion_reminder_email.get_email_provider",
        lambda: _fake_provider(sent),
    )

    event = inngest.Event(
        name="email/promotion-reminder.requested",
        data={
            "recipient_email": "teacher@uhas.edu.gh",
            "class_name": "JHS 1",
            "link": "/teacher/promotions/abc",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(promotion_reminder_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].subject == "Promotion list still pending: JHS 1"
