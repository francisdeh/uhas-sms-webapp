"""JWT verification for Supabase-issued tokens.

The frontend signs in via `@supabase/ssr`, which puts a session JWT in
a cookie + sends it on every API request as `Authorization: Bearer …`.
This module decodes that token and yields the claims we care about.

Supabase signs JWTs with ES256 (asymmetric, ECDSA P-256) on modern
projects — the previous HS256-with-shared-secret scheme is legacy.
We verify against the project's JWKS endpoint at
`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. The JWKS client caches
keys in-memory; lookup is by `kid` from the JWT header.

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
from functools import lru_cache

import jwt
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError

from app.core.config import settings
from app.core.errors import UnauthorizedError

# Supabase JWTs may carry either algorithm. Modern projects sign with
# ES256 via per-project signing keys; legacy projects still use HS256
# with the shared JWT secret. We accept both — the JWT header's `alg`
# field selects which path verifies it.
_ASYMMETRIC_ALGOS = ["ES256", "RS256"]
_SYMMETRIC_ALGOS = ["HS256"]


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
    # user_metadata.must_change_password — Supabase user_metadata is
    # user-writable, but this flag only gates a UX-forced password
    # rotation dialog, not an authorization boundary. Setting it to
    # False on the client side merely dismisses the dialog; the caller
    # still needs a valid session to reach anything sensitive.
    must_change_password: bool = False


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    """Cached JWKS client — fetches + memoises the project's signing keys.

    PyJWKClient handles HTTP fetch, parsing, kid lookup, and per-key
    caching internally. We wrap it in lru_cache so the client itself is
    instantiated once per process.
    """
    jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url, cache_keys=True)


def _verify_asymmetric(token: str) -> dict[str, object]:
    """Verify an ES256/RS256-signed token against the project JWKS.

    The signing key is looked up by `kid` from the JWT header. The
    JWKS client refetches the key set if a kid isn't cached — handles
    Supabase rotating keys without restarting the API.
    """
    signing_key = _jwks_client().get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=_ASYMMETRIC_ALGOS,
        options={"verify_aud": False, "require": ["sub", "exp"]},
    )


def _verify_symmetric(token: str) -> dict[str, object]:
    """Verify an HS256-signed token against the shared JWT secret.

    Kept as a fallback for legacy Supabase projects + local stacks that
    haven't migrated to asymmetric signing. The secret comes from
    `settings.supabase_jwt_secret`.
    """
    return jwt.decode(
        token,
        settings.supabase_jwt_secret,
        algorithms=_SYMMETRIC_ALGOS,
        options={"verify_aud": False, "require": ["sub", "exp"]},
    )


def verify_supabase_jwt(token: str) -> CurrentUser:
    """Decode + verify a Supabase JWT, return the request-scoped identity.

    Raises `UnauthorizedError` on any verification failure (bad sig,
    expired, missing claims). The global error handler in `app.main`
    converts that to a 401 response.

    Branches on the JWT header's `alg`:
      - `ES256` / `RS256` → JWKS lookup + asymmetric verify
      - `HS256`           → shared-secret symmetric verify

    Notes:
      - `verify_aud=False` because Supabase issues tokens with
        `aud="authenticated"`, which we don't strictly need to assert.
      - Required claims (`sub`, `exp`) are enforced by PyJWT itself.
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
        if alg in _ASYMMETRIC_ALGOS:
            payload = _verify_asymmetric(token)
        elif alg in _SYMMETRIC_ALGOS:
            payload = _verify_symmetric(token)
        else:
            raise UnauthorizedError(f"Unsupported JWT algorithm: {alg!r}.")
    except InvalidTokenError as exc:
        raise UnauthorizedError("Invalid or expired session.") from exc
    except Exception as exc:
        # JWKS fetch failures, key-not-found, etc. — all map to 401.
        raise UnauthorizedError("Could not verify session.") from exc

    app_metadata = payload.get("app_metadata") or {}
    if not isinstance(app_metadata, dict):
        app_metadata = {}

    user_metadata = payload.get("user_metadata") or {}
    if not isinstance(user_metadata, dict):
        user_metadata = {}

    email = payload.get("email")
    phone = payload.get("phone")
    return CurrentUser(
        user_id=str(payload["sub"]),
        email=email if isinstance(email, str) else None,
        phone=phone if isinstance(phone, str) else None,
        # role + school_id + linked_id live in app_metadata, NOT
        # user_metadata — the latter is user-writable and untrusted.
        role=app_metadata.get("role"),
        school_id=app_metadata.get("school_id"),
        linked_id=app_metadata.get("linked_id"),
        must_change_password=bool(user_metadata.get("must_change_password")),
    )
