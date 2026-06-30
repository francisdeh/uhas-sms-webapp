"""SchoolTermsService — business logic for the SchoolTerms sub-resource.

The Calendar tab in the Admin Settings UI posts all three terms for a
year at once. `upsert_year` is the atomic equivalent of that:

  1. For each of the three input terms, find-or-insert by natural key
     (school_id, academic_year, term).
  2. Update changed fields in place.
  3. Write a single audit_log row with the field-level diff across the
     whole batch — one save = one audit entry, not three.

The schema-level validator already enforced "exactly three terms,
numbered 1/2/3, end ≥ start" — by the time we get here, the payload
is well-formed.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.service import write_audit_log
from app.features.school_terms.model import SchoolTerm
from app.features.school_terms.repository import SchoolTermsRepository
from app.features.school_terms.schema import TermsUpsertRequest


def _row_snapshot(row: SchoolTerm) -> dict[str, Any]:
    """Minimal field map for audit diffing — only the mutable fields."""
    return {
        "term": row.term,
        "start_date": row.start_date.isoformat(),
        "end_date": row.end_date.isoformat(),
    }


class SchoolTermsService:
    @staticmethod
    async def list_for_school(session: AsyncSession, school_id: UUID | str) -> list[SchoolTerm]:
        """Return every term row for a school (every academic year)."""
        return await SchoolTermsRepository.list_for_school(session, school_id)

    @staticmethod
    async def upsert_year(
        session: AsyncSession,
        school_id: UUID | str,
        payload: TermsUpsertRequest,
        *,
        actor_user_id: UUID | str,
    ) -> list[SchoolTerm]:
        """Upsert all three terms for a (school, academic_year).

        Returns the persisted rows ordered by term number. Writes one
        audit_log row covering the full batch — empty diff (every term
        unchanged) skips the audit write.
        """
        before: dict[int, dict[str, Any]] = {}
        after: dict[int, dict[str, Any]] = {}
        persisted: list[SchoolTerm] = []

        for term_input in sorted(payload.terms, key=lambda t: t.term):
            existing = await SchoolTermsRepository.find_one(
                session, school_id, payload.academic_year, term_input.term
            )
            if existing is not None:
                snapshot_before = _row_snapshot(existing)
                changed = (
                    existing.start_date != term_input.start_date
                    or existing.end_date != term_input.end_date
                )
                if changed:
                    before[term_input.term] = snapshot_before
                    existing.start_date = term_input.start_date
                    existing.end_date = term_input.end_date
                    after[term_input.term] = _row_snapshot(existing)
                persisted.append(existing)
            else:
                new_row = SchoolTerm(
                    school_id=school_id,
                    academic_year=payload.academic_year,
                    term=term_input.term,
                    start_date=term_input.start_date,
                    end_date=term_input.end_date,
                )
                session.add(new_row)
                # New rows count as "after" only — no prior state to compare.
                after[term_input.term] = _row_snapshot(new_row)
                persisted.append(new_row)

        await session.flush()

        if after:
            await write_audit_log(
                session,
                school_id=school_id,
                user_id=actor_user_id,
                action="SCHOOL_TERMS_UPSERT",
                target_table="school_terms",
                target_id=None,  # batch op — no single target row
                before={"academic_year": payload.academic_year, "terms": before}
                if before
                else None,
                after={"academic_year": payload.academic_year, "terms": after},
            )

        return sorted(persisted, key=lambda t: t.term)
