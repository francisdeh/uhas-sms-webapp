"""Email-change dual-confirmation email — sends to both addresses.

Triggered by `email/account-email-change.requested`, emitted from
`UsersService.request_email_change` (`POST /me/email/request-change`).
Supabase's secure-email-change is enabled for this project (confirmed
against the local Supabase stack) — both the *old* and *new* addresses
must each confirm their own link before the change takes effect, so
one event fans out to two sends, each its own Inngest step (retriable
independently). Pure "send what I'm told" handler otherwise.

Event payload shape:
    {
      "old_email": "...",
      "new_email": "...",
      "current_link": "...",
      "new_link": "...",
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
    old_email = str(data["old_email"])
    new_email = str(data["new_email"])
    current_link = str(data["current_link"])
    new_link = str(data["new_link"])
    school_name = str(data["school_name"])
    school_address = str(data.get("school_address") or "")
    school_contact_email = str(data.get("school_contact_email") or "")

    async def _send_to_current() -> dict[str, Any]:
        provider = get_email_provider()
        text = (
            f"Hi,\n\nSomeone requested to change the email on your {school_name} account "
            f"from this address to {new_email}. If this wasn't you, you can safely ignore "
            f"this email.\n\nConfirm the change:\n{current_link}\n\n— {school_name}\n"
        )
        html = render_email_template(
            "email_change_current.html",
            new_email=new_email,
            confirm_link=current_link,
            school_name=school_name,
            school_address=school_address,
            school_contact_email=school_contact_email,
        )
        result = await provider.send(
            EmailMessage(
                to=old_email,
                subject="Confirm your email change",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    async def _send_to_new() -> dict[str, Any]:
        provider = get_email_provider()
        text = (
            f"Hi,\n\nConfirm that this is your new email address for your {school_name} "
            f"account. Both addresses need to confirm before the change takes effect.\n\n"
            f"Confirm:\n{new_link}\n\n— {school_name}\n"
        )
        html = render_email_template(
            "email_change_new.html",
            confirm_link=new_link,
            school_name=school_name,
            school_address=school_address,
            school_contact_email=school_contact_email,
        )
        result = await provider.send(
            EmailMessage(
                to=new_email,
                subject="Confirm your new email address",
                text=text,
                html=html,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    current_result = await ctx.step.run("send-to-current", _send_to_current)
    new_result = await ctx.step.run("send-to-new", _send_to_new)
    return {"current": current_result, "new": new_result}


account_email_change_job = inngest_client.create_function(
    fn_id="account-email-change",
    trigger=inngest.TriggerEvent(event="email/account-email-change.requested"),
)(_run)
