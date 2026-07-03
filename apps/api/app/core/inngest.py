"""Inngest client setup — background job runner.

Every feature's `jobs/` subfolder registers its functions with
`inngest_client` (via `@inngest_client.create_function(...)`); `main.py`
collects all of them into one list and calls `inngest.fast_api.serve(...)`
to mount the `/api/inngest` webhook route Inngest calls to invoke steps.

`is_production` is derived from `settings.env` rather than the SDK's
own `INNGEST_DEV` env-var autodetection — dev/test/staging all run in
"dev mode" (talks to a local `inngest dev` server, needs no cloud
credentials) and only `production` requires
`inngest_event_key` / `inngest_signing_key`. This keeps a fresh
checkout (and CI, and pytest) working with zero Inngest config, matching
every other setting in this file.

Local dev, two equivalent options:
  - `docker compose up -d inngest` (repo root) — brings up the official
    `inngest/inngest` image pre-wired to discover this app on
    `host.docker.internal:8000` (see `docker-compose.yml`).
  - `uv run inngest-cli dev -u http://localhost:8000/api/inngest` (or
    `npx inngest-cli dev ...`) in its own terminal.

Either way, the dev server + inspector UI comes up at
`http://localhost:8288`.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

import inngest
import sentry_sdk

from app.core.config import settings

inngest_client = inngest.Inngest(
    app_id="uhas-sms-api",
    event_key=settings.inngest_event_key,
    signing_key=settings.inngest_signing_key,
    is_production=settings.env == "production",
)


def with_sentry(
    fn: Callable[[inngest.Context], Awaitable[object]],
) -> Callable[[inngest.Context], Awaitable[object]]:
    """Wrap a job handler so a failure is captured in Sentry with the
    function id + run id attached, then re-raised so Inngest's own
    retry/backoff logic still runs.

    A no-op wrapper when Sentry isn't configured (`sentry_sdk.init()`
    was never called) — `capture_exception` silently drops in that case.
    """

    async def wrapper(ctx: inngest.Context) -> object:
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("inngest_function", fn.__name__)
            scope.set_tag("inngest_run_id", ctx.run_id)
            try:
                return await fn(ctx)
            except Exception:
                sentry_sdk.capture_exception()
                raise

    return wrapper
