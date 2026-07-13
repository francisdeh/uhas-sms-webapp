"""Rate limiting — global default + a stricter cap on expensive endpoints.

There's no login/OTP endpoint in this API to protect from brute force
(Supabase Auth handles that entirely client-side) — every route here
already requires a verified JWT except `/health`, `/school/public`, and
`POST /auth/reset-password` (the last of which triggers a real email
send for an anonymous caller, hence its own IP-keyed limit below). So
the threat model this addresses is mostly a runaway/buggy or
compromised *authenticated* client hammering the API, not anonymous
credential stuffing — `/auth/reset-password` is the one deliberate
exception.

Keys by the authenticated user's id (from the same JWT verification
`CurrentUserDep` uses), not client IP — `uvicorn` isn't configured to
trust Railway's `X-Forwarded-For`, so IP extraction behind that proxy
isn't reliable, and since every limited route requires auth anyway,
per-user keying is both simpler and more correct. Requests with no/
invalid token fall back to `slowapi`'s default IP-based key — an
aggregate bucket for garbage traffic, not per-client tracking.

Storage: Redis when `REDIS_URL` is set, in-memory otherwise (correct
only for a single instance — see `Settings.redis_url`). Same
resolve-once-at-construction pattern as `SupabaseAdminClient` /
`StorageClient`.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.security import verify_supabase_jwt

DEFAULT_LIMIT = "300/minute"
REPORT_CARD_PDF_LIMIT = "10/minute"
PASSWORD_RESET_LIMIT = "5/minute"


def _rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("authorization")
    if authorization:
        parts = authorization.split(maxsplit=1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            try:
                user = verify_supabase_jwt(parts[1])
                return f"user:{user.user_id}"
            except Exception:  # any verification failure falls back to IP
                pass
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=[DEFAULT_LIMIT],
    storage_uri=settings.redis_url or "memory://",
)
