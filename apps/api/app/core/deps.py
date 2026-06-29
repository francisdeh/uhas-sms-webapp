"""FastAPI dependencies for auth + scope enforcement.

Routers compose these to declare what a route requires. Examples:

  @router.get("/me")
  async def get_me(user: CurrentUserDep) -> ...:
      # any authenticated user

  @router.post("/students")
  async def create_student(
      user: Annotated[CurrentUser, Depends(require_role("Admin", "DeputyHead"))],
      ...
  ) -> ...:
      # only Admin or Deputy Head

The role/scope checks here are the **primary** authorization layer.
Postgres RLS is the backstop — even if a bug bypasses these deps,
RLS prevents cross-tenant or cross-scope data leakage. Both layers
exist on purpose.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Header

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import CurrentUser, verify_supabase_jwt


def _bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    """Extract `Bearer <token>` from the Authorization header.

    Returns the raw token string. Raises UnauthorizedError if the header
    is missing or malformed — clearer than letting JWT decoding error.
    """
    if not authorization:
        raise UnauthorizedError("Authorization header missing.")
    parts = authorization.split(maxsplit=1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedError("Authorization header must be 'Bearer <token>'.")
    return parts[1]


def get_current_user(
    token: Annotated[str, Depends(_bearer_token)],
) -> CurrentUser:
    """Resolve the request-scoped CurrentUser from the JWT.

    Use as `Annotated[CurrentUser, Depends(get_current_user)]` in
    endpoint signatures — or via the `CurrentUserDep` alias below.
    """
    return verify_supabase_jwt(token)


# Convenience alias — saves typing in endpoint signatures.
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_role(*allowed_roles: str) -> Callable[[CurrentUser], CurrentUser]:
    """Build a dependency that enforces role membership.

    Composes with `get_current_user` — the inner dep authenticates, the
    outer one checks the role claim. Raises ForbiddenError (→ 403) on a
    mismatch, distinct from UnauthorizedError (→ 401) for missing/bad
    tokens.

    Example:

        @router.post("/exams/{id}/publish")
        async def publish_exam(
            id: str,
            _user: Annotated[CurrentUser, Depends(require_role("Admin"))],
        ) -> ActionResult:
            ...
    """
    allowed = frozenset(allowed_roles)

    def _checker(user: CurrentUserDep) -> CurrentUser:
        if user.role not in allowed:
            raise ForbiddenError(
                f"This action requires one of: {', '.join(sorted(allowed))}.",
            )
        return user

    return _checker


def get_current_school_id(user: CurrentUserDep) -> str:
    """Resolve the current request's school_id from the JWT.

    Every domain endpoint should call this (directly or via
    CurrentSchoolIdDep) so repository queries can scope by school
    without trusting any path or query parameter. Raises ForbiddenError
    if the token has no school_id claim — a sign of a half-configured
    account that the system shouldn't let leak data either way.

    Example:

        @router.get("/students")
        async def list_students(
            school_id: CurrentSchoolIdDep,
        ) -> list[StudentOut]:
            return await student_service.list_in_school(school_id)
    """
    if not user.school_id:
        raise ForbiddenError("Account is not anchored to a school.")
    return user.school_id


# Convenience alias for endpoint signatures.
CurrentSchoolIdDep = Annotated[str, Depends(get_current_school_id)]


def assert_same_school(target_school_id: str, current_school_id: str) -> None:
    """Cross-tenant guard for endpoints that take a school_id parameter.

    Use whenever an endpoint accepts a school_id (path, query, or body)
    that *should* match the caller's JWT claim — typically because a
    multi-school admin is enrolling something for one of their schools.
    Today every account is single-school, so any mismatch is suspicious.

    Raises ForbiddenError on mismatch (→ 403). Distinct from
    UnauthorizedError (→ 401) so the frontend can show a clearer message.

    Example:

        @router.post("/schools/{school_id}/students")
        async def create_student(
            school_id: str,
            payload: CreateStudent,
            current_school_id: CurrentSchoolIdDep,
        ) -> StudentOut:
            assert_same_school(school_id, current_school_id)
            return await student_service.create(school_id, payload)
    """
    if target_school_id != current_school_id:
        raise ForbiddenError(
            "Cross-school access is not allowed for this account.",
        )
