"""Provider-agnostic outbound email — ports the pre-migration Next-side
`lib/email.ts` 1:1, including its "missing config is not an error"
contract: `get_email_provider()` never raises for missing config, it
returns a provider that logs and reports `skipped=True` so every
environment (dev, CI, tests) runs the same code path.

`get_email_provider()` prefers Resend (real production sends) when
configured, else falls back to plain SMTP — which in practice means
local Mailpit in dev (no credentials) or a real SMTP server if one is
configured — else the not-configured stub. Adding another provider is
a new class + a one-line change here — no caller changes.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Protocol

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailMessage:
    __slots__ = ("html", "subject", "text", "to")

    def __init__(self, *, to: str, subject: str, text: str, html: str | None = None) -> None:
        self.to = to
        self.subject = subject
        self.text = text
        self.html = html


class EmailResult:
    __slots__ = ("error", "skipped", "success")

    def __init__(self, *, success: bool, skipped: bool = False, error: str | None = None) -> None:
        self.success = success
        self.skipped = skipped
        self.error = error


class EmailProvider(Protocol):
    async def send(self, msg: EmailMessage) -> EmailResult: ...


class _NotConfiguredEmailProvider:
    """SMTP isn't set up. Logs a warning and reports success-but-skipped
    — matching the TS behaviour exactly. A missing mail server is an
    expected state (most dev/CI environments), not a failure."""

    async def send(self, msg: EmailMessage) -> EmailResult:
        logger.warning(
            "[email] SMTP not configured — would have sent to %s: %s", msg.to, msg.subject
        )
        return EmailResult(success=True, skipped=True)


class SmtpEmailProvider:
    """`smtplib` is blocking; every call runs in a thread via
    `asyncio.to_thread` to keep the event loop free — same pattern as
    `RealStorageClient` / `RealSupabaseAdminClient`.

    `user`/`password` are optional so this same class doubles as the
    local Mailpit provider (an unauthenticated SMTP catcher on
    `localhost:1025`) as well as a real authenticated SMTP server."""

    def __init__(
        self, *, host: str, port: int, user: str | None = None, password: str | None = None
    ) -> None:
        self._host = host
        self._port = port
        self._user = user
        self._password = password

    async def send(self, msg: EmailMessage) -> EmailResult:
        dev_redirect = settings.env != "production" and settings.email_dev_redirect
        to = dev_redirect or msg.to
        subject = f"[dev → {msg.to}] {msg.subject}" if dev_redirect else msg.subject
        from_addr = settings.email_from or (
            f"UHAS SMS <{self._user}>" if self._user else "UHAS SMS <no-reply@localhost>"
        )

        def _send() -> None:
            mime = MIMEMultipart("alternative")
            mime["From"] = from_addr
            mime["To"] = to
            mime["Subject"] = subject
            mime.attach(MIMEText(msg.text, "plain"))
            if msg.html:
                mime.attach(MIMEText(msg.html, "html"))

            # Port 465 → implicit TLS from connection open; anything else
            # (587, or Mailpit's 1025) → plaintext connect, STARTTLS only
            # if we actually have credentials to upgrade for.
            if self._port == 465:
                with smtplib.SMTP_SSL(self._host, self._port) as smtp:
                    if self._user and self._password:
                        smtp.login(self._user, self._password)
                    smtp.send_message(mime)
            else:
                with smtplib.SMTP(self._host, self._port) as smtp:
                    if self._user and self._password:
                        smtp.starttls()
                        smtp.login(self._user, self._password)
                    smtp.send_message(mime)

        try:
            await asyncio.to_thread(_send)
            return EmailResult(success=True)
        except Exception as exc:
            logger.error("[email] send to %s failed: %s", msg.to, exc)
            return EmailResult(success=False, error=str(exc))


class ResendEmailProvider:
    """Real production provider — Resend's HTTP API
    (https://resend.com/docs/api-reference/emails/send-email).

    `POST https://api.resend.com/emails`, Bearer-token auth, JSON body.
    A successful response is `{"id": "..."}`; a non-2xx response or a
    network error is `failed` — never raises."""

    _SEND_URL = "https://api.resend.com/emails"

    def __init__(self, *, api_key: str, from_addr: str) -> None:
        self._api_key = api_key
        self._from_addr = from_addr

    async def send(self, msg: EmailMessage) -> EmailResult:
        dev_redirect = settings.env != "production" and settings.email_dev_redirect
        to = dev_redirect or msg.to
        subject = f"[dev → {msg.to}] {msg.subject}" if dev_redirect else msg.subject

        payload: dict[str, object] = {
            "from": self._from_addr,
            "to": [to],
            "subject": subject,
            "text": msg.text,
        }
        if msg.html:
            payload["html"] = msg.html

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    self._SEND_URL,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.error("[email] Resend send to %s failed: %s", msg.to, exc)
            return EmailResult(success=False, error=str(exc))

        return EmailResult(success=True)


def get_email_provider() -> EmailProvider:
    if settings.resend_api_key:
        return ResendEmailProvider(
            api_key=settings.resend_api_key,
            from_addr=settings.email_from or "UHAS SMS <no-reply@uhas.edu.gh>",
        )
    if settings.smtp_host:
        return SmtpEmailProvider(
            host=settings.smtp_host,
            port=settings.smtp_port,
            user=settings.smtp_user,
            password=settings.smtp_password,
        )
    return _NotConfiguredEmailProvider()


def app_url(pathname: str) -> str:
    """Build a fully-qualified URL to a route in the Next.js app."""
    base = settings.app_url.rstrip("/")
    path = pathname if pathname.startswith("/") else f"/{pathname}"
    return f"{base}{path}"
