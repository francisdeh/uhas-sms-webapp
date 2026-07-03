"""Tests for the email integration.

`SmtpEmailProvider`'s real network send isn't covered here — same
convention as `RealStorageClient`/`RealSupabaseAdminClient`: CI has no
mail server to send against. What's covered: the not-configured
provider's "skip, don't fail" contract (the load-bearing behaviour
ported from the TS side), the factory's config-based resolution, and
`app_url`.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.integrations.email.provider import (
    EmailMessage,
    SmtpEmailProvider,
    _NotConfiguredEmailProvider,
    app_url,
    get_email_provider,
)


async def test_not_configured_provider_skips_instead_of_failing() -> None:
    provider = _NotConfiguredEmailProvider()
    result = await provider.send(
        EmailMessage(to="teacher@example.com", subject="Test", text="Body")
    )
    assert result.success is True
    assert result.skipped is True
    assert result.error is None


def test_factory_returns_not_configured_when_smtp_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    assert isinstance(get_email_provider(), _NotConfiguredEmailProvider)


def test_factory_returns_smtp_provider_when_fully_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_user", "school@gmail.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    assert isinstance(get_email_provider(), SmtpEmailProvider)


@pytest.mark.parametrize(
    ("host", "smtp_user", "password"),
    [
        (None, "u", "p"),
        ("h", None, "p"),
        ("h", "u", None),
    ],
)
def test_factory_falls_back_when_partially_configured(
    monkeypatch: pytest.MonkeyPatch, host: str | None, smtp_user: str | None, password: str | None
) -> None:
    monkeypatch.setattr(settings, "smtp_host", host)
    monkeypatch.setattr(settings, "smtp_user", smtp_user)
    monkeypatch.setattr(settings, "smtp_password", password)
    assert isinstance(get_email_provider(), _NotConfiguredEmailProvider)


def test_app_url_joins_base_and_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_url", "https://uhas-sms.example.com")
    assert (
        app_url("/teacher/lesson-plans/abc")
        == "https://uhas-sms.example.com/teacher/lesson-plans/abc"
    )
    assert (
        app_url("teacher/lesson-plans/abc")
        == "https://uhas-sms.example.com/teacher/lesson-plans/abc"
    )


def test_app_url_strips_trailing_slash_on_base(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_url", "https://uhas-sms.example.com/")
    assert app_url("/x") == "https://uhas-sms.example.com/x"
