"""SchoolsService — business logic for the Schools/Settings domain.

Mirrors `apps/web/src/features/settings/actions/_helpers.ts` —
specifically the field-level diff logic in `applySchoolSettingsPatch`.
On every PATCH we:

  1. Load the current row.
  2. Build `before` / `after` dicts from the *fields actually changing*
     (no point logging the full row each time — the audit table fills up
     fast otherwise).
  3. Write an `audit_log` row with the diff.
  4. Apply the patch.

Step 2 is the load-bearing bit: if a client PATCHes a field with its
current value, we treat that as a no-op and skip the audit row + the
UPDATE. Saves DB writes when the settings page submits unchanged forms.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.features.audit.service import write_audit_log
from app.features.schools.model import School
from app.features.schools.repository import SchoolsRepository
from app.features.schools.schema import SchoolUpdate


def _dump(value: Any) -> Any:
    """Convert Pydantic sub-models to plain dicts/lists for diffing + audit.

    SQLAlchemy gives us plain dicts/lists for jsonb columns; Pydantic
    gives us BaseModel instances after parsing. Normalise both to the
    same shape so equality compares meaningfully.
    """
    if isinstance(value, BaseModel):
        return value.model_dump()
    if isinstance(value, list):
        return [_dump(v) for v in value]
    return value


def _compute_diff(
    current: School, patch_fields: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (before, after) limited to fields whose value is actually changing.

    Empty (before == after for every field) → caller treats it as no-op.
    """
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    for field, new_value in patch_fields.items():
        old_value = getattr(current, field)
        normalised_new = _dump(new_value)
        if _dump(old_value) != normalised_new:
            before[field] = _dump(old_value)
            after[field] = normalised_new
    return before, after


class SchoolsService:
    @staticmethod
    async def get(session: AsyncSession, school_id: UUID | str) -> School:
        """Fetch the current school row, raising NotFoundError if missing.

        The Auth layer guarantees `school_id` comes from a valid JWT —
        but the row could theoretically be deleted out-of-band. 404 is
        the honest response.
        """
        row = await SchoolsRepository.get_by_id(session, school_id)
        if row is None:
            raise NotFoundError(f"School {school_id!r} not found.")
        return row

    @staticmethod
    async def patch(
        session: AsyncSession,
        school_id: UUID | str,
        patch: SchoolUpdate,
        *,
        actor_user_id: UUID | str,
    ) -> School:
        """Apply a partial update + write a field-level audit row.

        `exclude_unset=True` strips fields the client didn't include in
        the payload — without it, defaults would overwrite real values
        with None/0. This is the load-bearing bit that makes
        partial-PATCH semantics work.
        """
        current = await SchoolsService.get(session, school_id)

        # Only fields explicitly set by the client. exclude_unset=True is
        # what makes this a partial update — Pydantic doesn't apply
        # defaults to fields the JSON body omitted.
        patch_fields = patch.model_dump(exclude_unset=True)
        if not patch_fields:
            return current

        before, after = _compute_diff(current, patch_fields)

        # All fields unchanged → no-op. Skip the DB write and the audit
        # row. The frontend may submit unchanged forms (e.g. user clicks
        # "Save" without editing); we don't want to pollute audit_log
        # with empty diffs.
        if not after:
            return current

        # Apply only the fields that actually changed. We pass `after`
        # (not `patch_fields`) so the UPDATE statement carries the
        # minimum set of columns.
        await SchoolsRepository.apply_patch(session, current, after)

        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action="SCHOOL_SETTINGS_UPDATE",
            target_table="schools",
            target_id=school_id,
            before=before,
            after=after,
        )

        return current
