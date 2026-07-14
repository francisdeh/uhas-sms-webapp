"""SchoolsService — business logic for the Schools/Settings domain.

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

from datetime import date
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.features.audit.actions import SCHOOL_SETTINGS_UPDATE, SCHOOL_YEAR_ACTIVATED
from app.features.audit.service import write_audit_log
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.classes.service import ClassesService
from app.features.exams.constants import (
    DEFAULT_GRADE_BANDS,
    DEFAULT_PASS_MARK,
    DEFAULT_SCORE_WEIGHTS,
)
from app.features.promotions.academic_year import next_academic_year
from app.features.promotions.constants import SEASON_OPEN
from app.features.promotions.repository import PromotionsRepository
from app.features.school_terms.model import SchoolTerm
from app.features.school_terms.repository import SchoolTermsRepository
from app.features.schools.model import School
from app.features.schools.repository import SchoolsRepository
from app.features.schools.schema import (
    GradingBand,
    GradingDefaultsRead,
    PrepareNextYearRead,
    SchoolRead,
    SchoolUpdate,
    ScoreWeights,
)
from app.features.schools.term_resolver import resolve_current_term


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
    async def get_resolved(session: AsyncSession, school_id: UUID | str) -> SchoolRead:
        """Read shape for `GET /school` with grading defaults always
        resolved — never null, even for a school that hasn't customized
        either.

        `grading_scale` already tells consumers "customized or not"
        independently of whether `grading_bands`/`score_weights` are set,
        so resolving them here loses no information. Without this, every
        frontend consumer of a live (non-report-card) reading of these
        two fields would need its own copy of the GES defaults just to
        have *something* to compute with — exactly the kind of
        duplicated-value drift risk `ReportCardResponse.grading_bands`
        was fixed to avoid (see `report_card_svc.py`).
        """
        row = await SchoolsService.get(session, school_id)
        terms = await SchoolTermsRepository.list_for_school(session, school_id)
        read = SchoolRead.model_validate(row)
        return read.model_copy(
            update={
                "grading_bands": read.grading_bands
                or [GradingBand(**band) for band in DEFAULT_GRADE_BANDS],
                "score_weights": read.score_weights or ScoreWeights(**DEFAULT_SCORE_WEIGHTS),
                "current_term": resolve_current_term(row, terms, date.today()),
            }
        )

    @staticmethod
    def grading_defaults() -> GradingDefaultsRead:
        """The fixed GES-standard grading config — a pure constant, no
        DB access. Backs `GET /school/grading-defaults` so the frontend's
        "Reset to GES standard" control has no hardcoded copy of its own.
        """
        return GradingDefaultsRead(
            grading_bands=[GradingBand(**band) for band in DEFAULT_GRADE_BANDS],
            score_weights=ScoreWeights(**DEFAULT_SCORE_WEIGHTS),
            pass_mark=DEFAULT_PASS_MARK,
        )

    @staticmethod
    async def get_public(session: AsyncSession) -> School:
        """Fetch the school for the unauthenticated login-page branding read.

        No `school_id` to resolve against — there's no JWT yet. 404 only
        if the DB has no active school at all (misconfigured install).
        """
        row = await SchoolsRepository.get_first_active(session)
        if row is None:
            raise NotFoundError("No active school found.")
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
            action=SCHOOL_SETTINGS_UPDATE,
            target_table="schools",
            target_id=school_id,
            before=before,
            after=after,
        )

        return current

    @staticmethod
    async def prepare_next_year(
        session: AsyncSession, school_id: UUID | str
    ) -> PrepareNextYearRead:
        """Scaffold the school's next academic year ahead of Promotions:
        copy this year's classes forward, and pre-fill next year's
        `school_terms` by shifting this year's dates forward one year.

        Idempotent — skips any class/term that already exists for the
        target year, so it's safe to run more than once (e.g. an Admin
        re-runs it after manually adding an extra class).

        Both steps are read-then-selectively-insert; there is nothing to
        "undo" if run repeatedly, so no dedicated audit row — the created
        classes/terms are ordinary rows, indistinguishable from ones an
        Admin created by hand (which also aren't individually audited).
        """
        school = await SchoolsService.get(session, school_id)
        target_year = next_academic_year(school.academic_year)

        current_classes = await ClassesRepository.list_plain_for_year(
            session, school_id, school.academic_year
        )
        classes_created = 0
        for cls in current_classes:
            next_slug = ClassesService.next_year_slug(cls.slug, school.academic_year, target_year)
            if await ClassesRepository.find_by_slug(session, school_id, next_slug):
                continue
            session.add(
                Class(
                    slug=next_slug,
                    school_id=school_id,
                    name=cls.name,
                    division=cls.division,
                    academic_year=target_year,
                )
            )
            classes_created += 1

        current_terms = [
            t
            for t in await SchoolTermsRepository.list_for_school(session, school_id)
            if t.academic_year == school.academic_year
        ]
        terms_created = 0
        for term in current_terms:
            if await SchoolTermsRepository.find_one(session, school_id, target_year, term.term):
                continue
            session.add(
                SchoolTerm(
                    school_id=school_id,
                    academic_year=target_year,
                    term=term.term,
                    start_date=term.start_date.replace(year=term.start_date.year + 1),
                    end_date=term.end_date.replace(year=term.end_date.year + 1),
                )
            )
            terms_created += 1

        await session.flush()
        return PrepareNextYearRead(
            next_academic_year=target_year,
            classes_created=classes_created,
            terms_created=terms_created,
        )

    @staticmethod
    async def activate_next_year(
        session: AsyncSession, school_id: UUID | str, *, actor_user_id: UUID | str
    ) -> School:
        """Flip the school over to its next academic year — the missing
        counterpart to Promotions' `approve()`, which creates next-year
        enrolments but never touches `schools.academic_year`.

        Guarded: refuses while a promotion season is still open for the
        current year, so a school can't roll over with students not yet
        promoted. Resets `current_term`/`current_term_override` so the
        date-based auto-pick starts fresh for the new year.
        """
        school = await SchoolsService.get(session, school_id)
        current_year = school.academic_year
        target_year = next_academic_year(current_year)

        season = await PromotionsRepository.find_season(session, school_id, current_year)
        if season and season.status == SEASON_OPEN:
            raise ValidationError(
                f"Promotion season for {current_year} is still open — "
                f"close it before activating {target_year}."
            )

        before = {"academic_year": current_year, "current_term": school.current_term}
        school.academic_year = target_year
        school.current_term = 1
        school.current_term_override = None
        after = {"academic_year": target_year, "current_term": 1}
        await session.flush()

        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=SCHOOL_YEAR_ACTIVATED,
            target_table="schools",
            target_id=school_id,
            before=before,
            after=after,
        )
        return school
