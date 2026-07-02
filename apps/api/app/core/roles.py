"""Single source of truth for role identifiers.

These string values appear in three places:

  - The Supabase JWT's `app_metadata.role` claim — the trust anchor.
  - `require_role(...)` route guards.
  - Service-layer invariants (e.g. "non-Admin roles must have a division").

Spelling them anywhere as bare literals risks typos slipping past type
checks. Importing from here keeps every reference identical and lets
the `Role` literal type drive autocompletion + exhaustiveness checks.

Mirror these exactly with the TypeScript constant `USER_ROLES` in
[apps/web/src/features/auth/types.ts](../../../../web/src/features/auth/types.ts).
"""

from __future__ import annotations

from typing import Final, Literal

ADMIN: Final = "Admin"
DEPUTY_HEAD: Final = "DeputyHead"
TEACHER: Final = "Teacher"
PARENT: Final = "Parent"
ACCOUNTANT: Final = "Accountant"

Role = Literal["Admin", "DeputyHead", "Teacher", "Parent", "Accountant"]
"""The closed set of role strings the API accepts (auth-side)."""

SystemRole = Literal["Admin", "DeputyHead", "Teacher", "Accountant"]
"""Roles that a `staff` row's `system_role` column can hold — same as
`Role` minus `Parent` (parents aren't staff). Kept as its own union so
`staff.system_role = "Parent"` is a type error, not a runtime error."""

TeacherRank = Literal["Teacher", "Senior Teacher", "Principal Teacher"]
"""GES teacher-track ranks. Applied to `staff.rank`; the DB column is
`varchar(100)` (permissive) but every code-path validates against this
closed set. Management-track ranks (Principal Superintendent, Assistant
Director, Deputy Director, Director) aren't included — those staff
oversee multiple schools rather than sitting in one."""

ALL_ROLES: Final[tuple[Role, ...]] = (
    "Admin",
    "DeputyHead",
    "Teacher",
    "Parent",
    "Accountant",
)
