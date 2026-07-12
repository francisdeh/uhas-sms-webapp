"""Pydantic schemas for the Schools domain.

Follows the convention in
[docs/ENGINEERING-CONVENTIONS.md §20](../../../../../docs/ENGINEERING-CONVENTIONS.md):
`Base` → shared fields, `Update` → all-optional partial, `Read` →
response shape with server-set fields.

There's no `SchoolCreate` for now — schools are seeded via the Alembic
baseline + the Supabase seed script. A future "add tenant" flow would
add one.

`school_terms` is its own sub-resource (the Calendar tab) and gets its
own schema file when that's ported. Keeping it out keeps this surface
focused.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from pydantic.alias_generators import to_camel

from app.features.exams.constants import DEFAULT_PASS_MARK

# Wire-format config: Python attributes stay snake_case, JSON keys are
# camelCase. `populate_by_name=True` keeps snake_case input accepted too
# (test fixtures + CLI tools), but the canonical wire is camelCase so
# the OpenAPI typegen produces clean TS that matches the existing
# camelCase domain types in apps/web/src/features/<x>/types.ts.
_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
)


# ─── JSON sub-types ──────────────────────────────────────────────────────────
# Declared as separate models so the OpenAPI schema (and the regenerated
# `apps/web/src/types/api.d.ts`) carries them as named types, not inline
# anonymous objects. Each gets its own model_config because Pydantic
# configs aren't inherited across unrelated models.


class GradingBand(BaseModel):
    """One row in the school's grading-band table.

    Boundaries are inclusive on both ends; the score ranges are
    consecutive and cover 0-100 without gaps.
    """

    model_config = _CAMEL_CONFIG

    min: Annotated[int, Field(ge=0, le=100)]
    max: Annotated[int, Field(ge=0, le=100)]
    grade: Annotated[str, Field(min_length=1, max_length=10)]
    interpretation: Annotated[str, Field(min_length=1, max_length=50)]


class ScoreWeights(BaseModel):
    """Mid-term + end-of-term score weighting. Must sum to 100."""

    model_config = _CAMEL_CONFIG

    exam: Annotated[int, Field(ge=0, le=100)]
    cat1: Annotated[int, Field(ge=0, le=100)]
    cat2: Annotated[int, Field(ge=0, le=100)]
    group_work: Annotated[int, Field(ge=0, le=100)]
    project_work: Annotated[int, Field(ge=0, le=100)]

    @model_validator(mode="after")
    def _sum_to_100(self) -> ScoreWeights:
        total = self.exam + self.cat1 + self.cat2 + self.group_work + self.project_work
        if total != 100:
            raise ValueError(f"Score weights must sum to 100 (got {total}).")
        return self


class NotificationDefaults(BaseModel):
    """Which event categories trigger an in-app + email notification by default."""

    model_config = _CAMEL_CONFIG

    on_lesson_plan_rejected: bool
    on_announcement_posted: bool
    on_results_published: bool
    # Coarser than the matching user_preferences columns — one toggle
    # per direction gates both email and SMS at the school level; the
    # per-user prefs stay channel-specific.
    on_appointment_activity: bool = True
    on_appointment_decided: bool = True


# ─── School-level schemas ────────────────────────────────────────────────────


GradingScale = Literal["GES_STANDARD", "CUSTOM"]
ColorScheme = Literal["default", "uhas"]


class SchoolBase(BaseModel):
    """Fields shared by inbound + outbound representations.

    Server-set fields (id, created_at, is_active) live only on `Read`.
    Sub-resource fields (terms) are NOT here — they live in their own
    schema file (Phase 2.2).
    """

    model_config = _CAMEL_CONFIG

    # Identity
    name: Annotated[str, Field(min_length=2, max_length=255)]
    motto: Annotated[str | None, Field(default=None, max_length=255)]
    address: str | None = None
    phone: Annotated[str | None, Field(default=None, max_length=50)]
    email: EmailStr | None = None
    principal_name: Annotated[str | None, Field(default=None, max_length=255)]
    logo_url: Annotated[str | None, Field(default=None, max_length=500)]

    # Calendar (the per-term date ranges live in school_terms; this is just
    # the "what term are we in right now" pointer)
    academic_year: Annotated[str, Field(pattern=r"^\d{4}/\d{4}$")]
    current_term: Annotated[int, Field(ge=1, le=3)]

    # Grading
    grading_scale: GradingScale = "GES_STANDARD"
    grading_bands: list[GradingBand] | None = None
    score_weights: ScoreWeights | None = None
    pass_mark: Annotated[int, Field(ge=0, le=100)] = DEFAULT_PASS_MARK

    # Communication
    email_from_name: Annotated[str | None, Field(default=None, max_length=255)]
    email_reply_to: EmailStr | None = None
    notification_defaults: NotificationDefaults | None = None

    # Security — read-only today (see SchoolUpdate docstring on this
    # section): not yet wired to any actual enforcement, so PATCH
    # doesn't accept them, but they're still surfaced for display.
    password_min_length: Annotated[int, Field(ge=6, le=64)] = 8
    force_password_change_on_first_login: bool = True

    # Branding
    default_color_scheme: ColorScheme = "uhas"
    sidebar_accent_hex: Annotated[str | None, Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")]

    # Leave — only Casual leave gets a balance; see leave_requests docs.
    casual_leave_annual_days: Annotated[int, Field(ge=0, le=365)] = 21


class SchoolUpdate(BaseModel):
    """Partial update payload for `PATCH /school`.

    All fields optional — clients send only what's changing. The router
    builds the audit-log diff from the subset of fields actually present
    in the parsed model.

    Doesn't inherit `SchoolBase` — Update's all-optional shape can't
    compose cleanly with Base's required fields.

    `model_config(extra='forbid')` rejects unknown fields so a typo on
    the client never silently no-ops.
    """

    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
    )

    # Identity
    name: Annotated[str | None, Field(default=None, min_length=2, max_length=255)] = None
    motto: Annotated[str | None, Field(default=None, max_length=255)] = None
    address: str | None = None
    phone: Annotated[str | None, Field(default=None, max_length=50)] = None
    email: EmailStr | None = None
    principal_name: Annotated[str | None, Field(default=None, max_length=255)] = None
    logo_url: Annotated[str | None, Field(default=None, max_length=500)] = None

    # Calendar
    academic_year: Annotated[str | None, Field(default=None, pattern=r"^\d{4}/\d{4}$")] = None
    current_term: Annotated[int | None, Field(default=None, ge=1, le=3)] = None

    # Grading
    grading_scale: GradingScale | None = None
    grading_bands: list[GradingBand] | None = None
    score_weights: ScoreWeights | None = None
    pass_mark: Annotated[int | None, Field(default=None, ge=0, le=100)] = None

    # Communication
    email_from_name: Annotated[str | None, Field(default=None, max_length=255)] = None
    email_reply_to: EmailStr | None = None
    notification_defaults: NotificationDefaults | None = None

    # No Security fields here — password_min_length and
    # force_password_change_on_first_login aren't enforced by anything
    # yet (see SchoolBase), so PATCH doesn't accept them; session_timeout
    # was removed outright (Supabase Auth controls session expiry, not
    # this app).

    # Branding
    default_color_scheme: ColorScheme | None = None
    sidebar_accent_hex: Annotated[str | None, Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")] = (
        None
    )

    # Leave
    casual_leave_annual_days: Annotated[int | None, Field(default=None, ge=0, le=365)] = None


class SchoolRead(SchoolBase):
    """Outbound response shape — full school settings.

    Includes server-set fields (`id`, `slug`, `is_active`, `created_at`)
    on top of the editable `Base` shape. `from_attributes=True` lets
    routers validate ORM rows directly:

        return SchoolRead.model_validate(school_orm_row)

    `id` is the uuid PK; `slug` is the human-readable identifier
    ("uhas-basic") for URLs + audit-log readability. Pydantic
    serialises UUID as ISO-string in JSON; the frontend treats it as
    an opaque string.
    """

    id: UUID
    slug: str
    is_active: bool = True
    created_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class SchoolPublicRead(BaseModel):
    """Outbound shape for the one unauthenticated read in this domain.

    The login page needs the school's name/motto/logo before any
    session exists — there's no JWT yet to resolve `school_id` from.
    Deliberately minimal: only cosmetic fields a login screen would
    ever need, nothing that would matter if cached or logged publicly.

    Single-tenant-only for now — see `SchoolsRepository.get_first_active`.
    Revisit when a multi-school onboarding flow needs the login page to
    resolve a *specific* tenant (e.g. by subdomain/slug) instead.
    """

    name: str
    motto: str | None = None
    logo_url: str | None = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class GradingDefaultsRead(BaseModel):
    """The GES-standard grading config, independent of any school.

    A process-level constant (from `app.features.exams.constants`), not a
    DB read — this is the fixed national standard the Settings > Grading
    "Reset to GES standard" button restores. Served so the frontend has
    no hardcoded copy of the bands/weights to drift from the backend.
    """

    model_config = _CAMEL_CONFIG

    grading_bands: list[GradingBand]
    score_weights: ScoreWeights
    pass_mark: int
