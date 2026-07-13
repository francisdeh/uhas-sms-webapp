"""Password-reset email.

Triggered by `email/password-reset.requested`, emitted from
`UsersService.request_password_reset` — the enumeration-safe guard
(never reveal whether an account exists) lives entirely at the emit
site, not here: this job only ever runs for a real account, since the
caller silently no-ops for an unknown email. Pure "send what I'm told"
handler, same shape as `account_invite_email.py`.

Event payload shape:
    {
      "email": "...",
      "reset_link": "...",
      "school_name": "...",
      "school_address": "..." | "",
      "school_contact_email": "..." | ""
    }
"""

from __future__ import annotations

from typing import Any

import inngest

from app.core.inngest import inngest_client, with_sentry
from app.integrations.email.provider import EmailMessage, get_email_provider
from app.integrations.email.templates import render_email_template


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    email = str(data["email"])
    reset_link = str(data["reset_link"])
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")

    text = (
        f"Hi,\n\n"
        f"We received a request to reset the password for your {school_name} account. "
        "If this wasn't you, you can safely ignore this email.\n\n"
        f"Reset your password:\n{reset_link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "password_reset.html",
        reset_link=reset_link,
        school_name=school_name,
        school_address=school_address,
        school_contact_email=school_contact_email,
    )

    async def _send() -> dict[str, Any]:
        provider = get_email_provider()
        result = await provider.send(
            EmailMessage(
                to=email,
                subject="Reset your password",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


password_reset_email_job = inngest_client.create_function(
    fn_id="password-reset-email",
    trigger=inngest.TriggerEvent(event="email/password-reset.requested"),
)(_run)
