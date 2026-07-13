"""Tests for the 3 account-email jobs — pure "send what I'm told"
handlers, no DB access, same coverage shape as
`appointments/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.users.jobs import USERS_JOBS
from app.features.users.jobs.account_email_change import account_email_change_job
from app.features.users.jobs.account_invite_email import account_invite_email_job
from app.features.users.jobs.password_reset_email import password_reset_email_job
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_jobs_are_registered() -> None:
    assert account_invite_email_job in USERS_JOBS
    assert password_reset_email_job in USERS_JOBS
    assert account_email_change_job in USERS_JOBS
    assert account_invite_email_job.id == "uhas-sms-api-account-invite-email"
    assert password_reset_email_job.id == "uhas-sms-api-password-reset-email"
    assert account_email_change_job.id == "uhas-sms-api-account-email-change"


def test_invite_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.users.jobs.account_invite_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/account-invite.requested",
        data={
            "email": "dan@example.com",
            "display_name": "Dan Doe",
            "invite_link": "https://supabase.example.com/verify?type=invite",
            **_FOOTER,
        },
    )
    res = mocked.trigger(account_invite_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "dan@example.com"
    assert "Dan Doe" in sent[0].text
    assert sent[0].html is not None
    assert "UHAS Basic School" in sent[0].html
    # Not gated by preferences — no "Manage email preferences" footer link.
    assert "Manage email preferences" not in sent[0].html


def test_password_reset_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.users.jobs.password_reset_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/password-reset.requested",
        data={
            "email": "dan@example.com",
            "reset_link": "https://supabase.example.com/verify?type=recovery",
            **_FOOTER,
        },
    )
    res = mocked.trigger(password_reset_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "dan@example.com"
    assert sent[0].subject == "Reset your password"
    assert sent[0].html is not None


def test_email_change_job_sends_to_both_addresses(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.users.jobs.account_email_change.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/account-email-change.requested",
        data={
            "old_email": "old@example.com",
            "new_email": "new@example.com",
            "current_link": "https://supabase.example.com/verify?type=email_change_current",
            "new_link": "https://supabase.example.com/verify?type=email_change_new",
            **_FOOTER,
        },
    )
    res = mocked.trigger(account_email_change_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 2
    recipients = {m.to for m in sent}
    assert recipients == {"old@example.com", "new@example.com"}
    for message in sent:
        assert message.html is not None
