"""Account-invite email — staff and parent logins alike.

Triggered by `email/account-invite.requested`, emitted from
`UsersService._emit_account_invite_email` (called from
`provision_login` whenever an email is present) — not gated by any
notification preference, same "always send, no opt-out" rationale as
the phone-only onboarding SMS. Pure "send what I'm told" handler, same
division of labour as `appointments/jobs/appointment_requested_email.py`.

Event payload shape:
    {
      "email": "...",
      "display_name": "...",
      "invite_link": "...",
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
    display_name = str(data["display_name"])
    invite_link = str(data["invite_link"])
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")

    text = (
        f"Hi {display_name},\n\n"
        f"An account has been created for you on {school_name}'s management system.\n\n"
        f"Set your password to get started:\n{invite_link}\n\n"
        f"— {school_name}\n"
    )
    html = render_email_template(
        "account_invite.html",
        display_name=display_name,
        invite_link=invite_link,
        school_name=school_name,
        school_address=school_address,
        school_contact_email=school_contact_email,
    )

    async def _send() -> dict[str, Any]:
        provider = get_email_provider()
        result = await provider.send(
            EmailMessage(
                to=email,
                subject=f"Welcome to {school_name}",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


account_invite_email_job = inngest_client.create_function(
    fn_id="account-invite-email",
    trigger=inngest.TriggerEvent(event="email/account-invite.requested"),
)(_run)
