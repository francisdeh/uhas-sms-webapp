"""Tests for the 3 scheme email jobs — pure "send what I'm told"
handlers, no DB access, same coverage shape as
`leave_requests/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.schemes.jobs import SCHEMES_JOBS
from app.features.schemes.jobs.scheme_acknowledged_email import scheme_acknowledged_email_job
from app.features.schemes.jobs.scheme_commented_email import scheme_commented_email_job
from app.features.schemes.jobs.scheme_submitted_email import scheme_submitted_email_job
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_jobs_are_registered() -> None:
    assert scheme_submitted_email_job in SCHEMES_JOBS
    assert scheme_acknowledged_email_job in SCHEMES_JOBS
    assert scheme_commented_email_job in SCHEMES_JOBS
    assert scheme_submitted_email_job.id == "uhas-sms-api-scheme-submitted-email"
    assert scheme_acknowledged_email_job.id == "uhas-sms-api-scheme-acknowledged-email"
    assert scheme_commented_email_job.id == "uhas-sms-api-scheme-commented-email"


def test_submitted_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.schemes.jobs.scheme_submitted_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/scheme-submitted.requested",
        data={
            "recipient_email": "kojo@uhas.edu.gh",
            "teacher_name": "Ama Owusu",
            "scheme_title": "Fractions scheme of work",
            "class_name": "JHS 1",
            "link": "/teacher/schemes",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(scheme_submitted_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "kojo@uhas.edu.gh"
    assert sent[0].subject == "Scheme submitted by Ama Owusu"
    assert "Fractions scheme of work" in sent[0].text
    assert sent[0].html is not None
    assert "UHAS Basic School" in sent[0].html


def test_acknowledged_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.schemes.jobs.scheme_acknowledged_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/scheme-acknowledged.requested",
        data={
            "recipient_email": "ama@uhas.edu.gh",
            "scheme_title": "Fractions scheme of work",
            "class_name": "JHS 1",
            "comment": "Looks good",
            "link": "/teacher/schemes",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(scheme_acknowledged_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "ama@uhas.edu.gh"
    assert sent[0].subject == "Scheme acknowledged: Fractions scheme of work"
    assert "Looks good" in sent[0].text
    assert sent[0].html is not None
    assert "Looks good" in sent[0].html


def test_commented_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.schemes.jobs.scheme_commented_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/scheme-commented.requested",
        data={
            "recipient_email": "kojo@uhas.edu.gh",
            "commenter_name": "Ama Owusu",
            "scheme_title": "Fractions scheme of work",
            "class_name": "JHS 1",
            "comment": "Uploaded the missing week 3 content.",
            "link": "/teacher/schemes",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(scheme_commented_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "kojo@uhas.edu.gh"
    assert sent[0].subject == "New comment on Fractions scheme of work"
    assert "Ama Owusu commented" in sent[0].text
