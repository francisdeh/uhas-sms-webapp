"""Results-published parent email.

Triggered by `email/results-published.requested`, emitted from
`ExamsService._notify_results_published` only after both gates pass
(school's `notification_defaults.on_results_published` +
the guardian's own `user_preferences.email_on_results_published`) — the
gating and recipient resolution happen at the emit site, not here, so
this job stays a pure "send what I'm told" handler, same division of
labour as `lesson_plans/jobs/rejection_email.py`.

Event payload shape:
    {
      "guardian_email": "...",
      "exam_name": "...",
      "child_names": ["...", ...],
      "link": "/parent/results"
    }
"""

from __future__ import annotations

from typing import Any, cast

import inngest

from app.core.inngest import inngest_client, with_sentry
from app.integrations.email.provider import EmailMessage, app_url, get_email_provider


def _format_children(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return ", ".join(names[:-1]) + f", and {names[-1]}"


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, Any]:
    data = ctx.event.data
    guardian_email = str(data["guardian_email"])
    exam_name = str(data["exam_name"])
    child_names = [str(n) for n in cast("list[Any]", data["child_names"])]
    link = app_url(str(data["link"]))

    who = _format_children(child_names)
    text = (
        f"Hi,\n\n"
        f"Results for {who} are now published for {exam_name}.\n\n"
        f"View the full report card:\n{link}\n\n"
        f"— UHAS SMS\n"
    )

    async def _send() -> dict[str, Any]:
        provider = get_email_provider()
        result = await provider.send(
            EmailMessage(
                to=guardian_email,
                subject=f"Results published: {exam_name}",
                text=text,
            )
        )
        return {"success": result.success, "skipped": result.skipped, "error": result.error}

    return await ctx.step.run("send-email", _send)


results_published_email_job = inngest_client.create_function(
    fn_id="results-published-email",
    trigger=inngest.TriggerEvent(event="email/results-published.requested"),
)(_run)
