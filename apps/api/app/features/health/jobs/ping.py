"""A trivial job that proves the Inngest runner is wired end-to-end.

Fire it manually from the Inngest Dev Server UI (`http://localhost:8288`,
event name `job/ping`) or via `inngest_client.send(inngest.Event(name="job/ping"))`
from a Python shell. Existence of this job (and it completing with a
result) is the "Inngest jobs run on trigger" bar from the Phase 3 plan.
"""

from __future__ import annotations

from datetime import UTC, datetime

import inngest

from app.core.inngest import inngest_client, with_sentry


@with_sentry
async def _run(ctx: inngest.Context) -> dict[str, str]:
    async def _step() -> dict[str, str]:
        return {
            "message": "pong",
            "received_at": datetime.now(UTC).isoformat(),
        }

    return await ctx.step.run("respond", _step)


ping_job = inngest_client.create_function(
    fn_id="health-ping",
    trigger=inngest.TriggerEvent(event="job/ping"),
)(_run)
