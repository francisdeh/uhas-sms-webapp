# Rate-limiting audit — design

**Date:** 2026-07-05
**Phase:** 3.5 — Platform completion & admin polish
**Status:** Approved, ready for implementation

## Context

No rate limiting exists anywhere in `apps/api` today. An audit of the current surface found the classic "protect login from brute force" scenario doesn't apply here: there is no `/login`, password-verification, or OTP endpoint in FastAPI at all — Supabase Auth handles all of that entirely client-side, and Supabase's own infrastructure is responsible for rate-limiting auth attempts on its end. FastAPI only ever *verifies* an already-issued JWT (`app/core/security.py`, HS256 with a shared secret — no JWKS network call).

Every route in `apps/api` requires a valid JWT except `GET /health` (explicitly unauthenticated, for Railway/load-balancer liveness probes). No public unauthenticated write/mutation endpoint exists. The one endpoint with a real cost profile is `GET /students/{id}/report-card/pdf` (`app/features/exams/router.py`) — a cache miss runs WeasyPrint synchronously in-request, which is CPU-heavy.

Deployment: `apps/api` runs as a single Railway instance today (no `numReplicas`/scaling config in `railway.toml`), and no Redis or other shared cache exists anywhere in the stack.

## Goals

- A global per-user request cap across all authenticated endpoints, as a safety net against a runaway/buggy client or a compromised account — not specifically to stop brute-force login (that vector doesn't exist in this codebase).
- A stricter cap on the report-card PDF endpoint given its CPU cost.
- Correct behavior if `apps/api` is ever scaled to multiple Railway instances (Redis-backed from day one, per explicit choice — see below).
- Zero new local-dev setup burden.

## Non-goals

- Rate-limiting `/health` — Railway hits it constantly; throttling it would be actively harmful.
- Per-IP rate limiting as the primary mechanism — every limited endpoint already requires auth, so per-user keying (from the verified JWT) is both simpler and more correct than trying to extract a real client IP from behind Railway's proxy.
- Fixing the proxy-header/real-client-IP gap (`uvicorn` isn't currently configured to trust `X-Forwarded-For` from Railway's edge). Confirmed nothing in this design's scope needs correct per-IP identification — see "Known limitation" below.

## Architecture

### Library

`slowapi` — the standard FastAPI/Starlette rate-limiting library (wraps the `limits` package). Decorator-based: `@limiter.limit("300/minute")` per route, plus a default applied globally via the `Limiter`'s `default_limits`.

### Storage backend

Mirrors the existing `SupabaseAdminClient` (`app/features/users/supabase_admin.py`) / `StorageClient` (`app/integrations/storage.py`) pattern exactly:

- New `redis_url: str | None` setting in `app/core/config.py`, default `None`, documented.
- When set → `slowapi`'s Redis-backed storage.
- When unset (local dev — zero new setup required) → `slowapi`'s in-memory storage, automatically.
- No call-site branching — resolved once, at `Limiter` construction.

**Redis provisioning is out of this repo's control** — a Redis service needs to be added on Railway and `REDIS_URL` wired as an env var (or reference variable) there. Not done as part of this change (no authenticated Railway access from this environment); tracked as a manual deploy step.

### Keying

The rate-limit key function independently verifies the JWT from the `Authorization` header (reusing the existing HS256 verification helper — cheap HMAC check, not a network call) and uses the `sub`/`uid` claim as the key. A request with no/invalid token (shouldn't normally happen since routes require auth, but covers garbage traffic hitting a protected route before it 401s) falls back to `slowapi`'s default IP-based key — an aggregate "unauthenticated garbage" bucket, not per-real-client tracking, given the proxy-header gap noted above. `GET /health` is `@limiter.exempt`.

### Limits

- **Global default: 300 requests/minute** per user. Generous enough that normal dashboard usage (several parallel calls per page navigation) never trips it; tight enough to catch a runaway retry loop.
- **Report-card PDF: 10 requests/minute** per user. An Admin can legitimately request many different students' cards, but 10/min stays well above normal usage while capping worst-case WeasyPrint load.

Both values are easy to tune post-launch if real usage shows they're wrong in either direction.

### Error shape

A `RateLimitExceeded` exception handler maps to the *same* `AppError` envelope every other error in this API already uses (`app/main.py`'s existing `@app.exception_handler(AppError)` pattern) — `{"error": {"code": "rate_limited", "message": "..."}}`, HTTP 429. The frontend's existing `ApiError` class (`apps/web/src/lib/api/client.ts`) already parses this envelope, so no frontend changes are needed to surface a rate-limit error as a normal toast.

### Testing

The `Limiter` instance needs to be resettable/injectable between tests — either via a FastAPI dependency-injectable seam (matching the `app.dependency_overrides` pattern used for `SupabaseAdminClient`/`StorageClient` fakes) or `slowapi`'s own reset API, whichever fits better once verified against the installed package's actual surface during implementation (same "verify against the real package, don't assume" approach that caught a real WeasyPrint package-name mismatch during the report-card PDF work).

## Known limitation

The IP-based fallback key (for unauthenticated/malformed requests hitting a protected route) is not reliable behind Railway's proxy today, since `uvicorn` isn't configured to trust `X-Forwarded-For` (`--proxy-headers`/`--forwarded-allow-ips`). This means that fallback bucket is effectively a single shared counter for all such traffic, not per-client. Accepted as out of scope — nothing in this design's actual threat model depends on correct per-IP identification. Revisit if a future unauthenticated endpoint is added that needs it.

## Open questions

None outstanding — scope, keying, storage backend, limits, and error shape were each explicitly decided during brainstorming.
