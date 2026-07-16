"""Tests for the announcement-posted email job — pure "send what I'm
told" handler, no DB access, same coverage shape as
`promotions/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.announcements.jobs import ANNOUNCEMENTS_JOBS
from app.features.announcements.jobs.announcement_posted_email import (
    announcement_posted_email_job,
)
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_job_is_registered() -> None:
    assert announcement_posted_email_job in ANNOUNCEMENTS_JOBS
    assert announcement_posted_email_job.id == "uhas-sms-api-announcement-posted-email"


def _fake_provider(sent: list[EmailMessage]) -> object:
    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    return _FakeProvider()


def test_non_critical_job_sends_plain_subject(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        "app.features.announcements.jobs.announcement_posted_email.get_email_provider",
        lambda: _fake_provider(sent),
    )

    event = inngest.Event(
        name="email/announcement-posted.requested",
        data={
            "recipient_email": "parent@uhas.edu.gh",
            "title": "PTA meeting",
            "body": "Come to the hall at 4pm.",
            "is_critical": False,
            "link": "/parent/announcements",
            "preferences_link": "/parent/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(announcement_posted_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "parent@uhas.edu.gh"
    assert sent[0].subject == "PTA meeting"
    assert sent[0].html is not None
    assert "Critical announcement" not in sent[0].html


def test_critical_job_sends_warning_prefixed_subject_and_banner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[EmailMessage] = []
    monkeypatch.setattr(
        "app.features.announcements.jobs.announcement_posted_email.get_email_provider",
        lambda: _fake_provider(sent),
    )

    event = inngest.Event(
        name="email/announcement-posted.requested",
        data={
            "recipient_email": "teacher@uhas.edu.gh",
            "title": "School closed",
            "body": "Storm warning in effect.",
            "is_critical": True,
            "link": "/teacher/announcements",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(announcement_posted_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].subject == "⚠ School closed"
    assert "CRITICAL ANNOUNCEMENT" in sent[0].text
    assert sent[0].html is not None
    assert "Critical announcement" in sent[0].html
