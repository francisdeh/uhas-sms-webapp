"""JWT verification for Supabase-issued tokens.

The frontend signs in via `@supabase/ssr`, which puts a session JWT in
a cookie + sends it on every API request as `Authorization: Bearer …`.
This module decodes that token and yields the claims we care about.

Supabase signs with HS256 by default — symmetric, so we just need the
`supabase_jwt_secret` from `app.core.config.settings` to verify.

What we read from the token:

  - `sub`             the Supabase auth user id (uuid)
  - `app_metadata.role`        Admin | DeputyHead | Teacher | Accountant | Parent
  - `app_metadata.school_id`   the user's school (multi-tenant anchor)
  - `app_metadata.linked_id`   FK to staff.id or guardians.id

`role`, `school_id`, and `linked_id` are written into `app_metadata` at
sign-up by the seed script + admin user-creation flows. They're not in
the token until that happens.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from jwt.exceptions import InvalidTokenError

from app.core.config import settings
from app.core.errors import UnauthorizedError


@dataclass(frozen=True, slots=True)
class CurrentUser:
    """Identity + scope claims extracted from a verified JWT.

    Frozen + slotted because every request constructs one; we want it
    cheap and immutable.
    """

    user_id: str  # auth.users.id (uuid string)
    email: str | None
    phone: str | None
    role: str | None
    school_id: str | None
    linked_id: str | None


def verify_supabase_jwt(token: str) -> CurrentUser:
    """Decode + verify a Supabase JWT, return the request-scoped identity.

    Raises `UnauthorizedError` on any verification failure (bad sig,
    expired, missing claims). The global error handler in `app.main`
    converts that to a 401 response.

    Notes:
      - `verify_aud=False` because Supabase issues tokens with
        `aud="authenticated"`, which we don't strictly need to assert.
        Switch to True + pass `audience="authenticated"` if you want
        the extra belt-and-suspenders.
      - Required claims (`sub`, `exp`) are enforced by PyJWT itself.
    """
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False, "require": ["sub", "exp"]},
        )
    except InvalidTokenError as exc:
        raise UnauthorizedError("Invalid or expired session.") from exc

    app_metadata = payload.get("app_metadata") or {}

    return CurrentUser(
        user_id=str(payload["sub"]),
        email=payload.get("email"),
        phone=payload.get("phone"),
        # role + school_id + linked_id live in app_metadata, NOT
        # user_metadata — the latter is user-writable and untrusted.
        role=app_metadata.get("role"),
        school_id=app_metadata.get("school_id"),
        linked_id=app_metadata.get("linked_id"),
    )
