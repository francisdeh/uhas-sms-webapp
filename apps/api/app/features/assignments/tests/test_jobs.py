"""Tests for the assignment-created email job — pure "send what I'm
told" handler, no DB access, same coverage shape as
`attendance/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.assignments.jobs import ASSIGNMENTS_JOBS
from app.features.assignments.jobs.assignment_created_email import assignment_created_email_job
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_job_is_registered() -> None:
    assert assignment_created_email_job in ASSIGNMENTS_JOBS
    assert assignment_created_email_job.id == "uhas-sms-api-assignment-created-email"


def test_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.assignments.jobs.assignment_created_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/assignment-created.requested",
        data={
            "guardian_email": "akosua@uhas.edu.gh",
            "title": "Fractions worksheet",
            "class_name": "JHS 1",
            "due_note": " Due 01 Feb.",
            "link": "/parent/assignments",
            "preferences_link": "/parent/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(assignment_created_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "akosua@uhas.edu.gh"
    assert sent[0].subject == "New assignment: Fractions worksheet"
    assert "Fractions worksheet" in sent[0].text
    assert "JHS 1" in sent[0].text
    assert sent[0].html is not None
    assert "UHAS Basic School" in sent[0].html


def test_job_defaults_missing_due_note_to_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.assignments.jobs.assignment_created_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/assignment-created.requested",
        data={
            "guardian_email": "akosua@uhas.edu.gh",
            "title": "Reading log",
            "class_name": "Primary 3",
            "link": "/parent/assignments",
            "preferences_link": "/parent/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(assignment_created_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert "Reading log" in sent[0].text
