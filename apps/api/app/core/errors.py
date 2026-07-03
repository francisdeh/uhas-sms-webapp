"""Error envelopes — the FastAPI equivalent of the frontend's ActionResult.

Internal code throws domain exceptions; the global handler in
`app.main` catches them and converts to a consistent JSON shape:

    { "error": { "code": "string", "message": "string" } }

Status codes come from the exception subclass. Validation errors are
handled by FastAPI's built-in 422 path; this module covers business
errors only.
"""

from typing import Any


class AppError(Exception):
    """Base for every business error the API surfaces.

    Subclasses set the HTTP status and a stable string code. The message
    is human-readable; clients render it to the user.
    """

    status_code: int = 500
    code: str = "internal_error"

    def __init__(
        self,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}
        # Per-instance override for cases where one subclass needs to
        # emit a more specific code than its class default (e.g.
        # BadRequestError → "invalid_query" for a mutually-exclusive
        # query-param violation).
        if code is not None:
            self.code = code


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ValidationError(AppError):
    """Business validation, distinct from FastAPI's request-shape 422.

    Use this when a request is well-formed but breaks a domain rule —
    e.g. "Exam is already published; scores can't be edited."
    """

    status_code = 400
    code = "validation_error"


class BadRequestError(AppError):
    """Request-shape violations that FastAPI's own 422 path doesn't catch —
    e.g. mutually exclusive query params, or a `?since=` value that fails
    a hand-rolled parse. Emitted as a 400 with a stable string code so
    the frontend can branch on it.
    """

    status_code = 400
    code = "bad_request"


class ServiceUnavailableError(AppError):
    """External dependency is unreachable or not configured.

    Raised when a required upstream (Supabase Auth admin API, an SMS
    provider, etc.) is unusable at runtime — either its credentials are
    absent from settings or the network call itself failed. Distinct
    from a domain 400/404 because the request is well-formed and
    authorized; the failure is on our side.
    """

    status_code = 503
    code = "service_unavailable"
