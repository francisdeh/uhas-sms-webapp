# Migration cleanup checklist

When the Drizzle / Next-side Server Action layer is fully decommissioned (Phase 2 complete + the legacy `apps/web/src/features/*/actions/index.ts` files are deleted), do this sweep.

## A. Pure-comment cleanup

These are docstrings / inline comments that reference "Drizzle", "legacy Server Action", or "mirrors X" — once X is gone, the reference is stale and should be edited or deleted.

| File | Line | What to do |
|---|---|---|
| [apps/api/app/features/staff/model.py:3](../apps/api/app/features/staff/model.py#L3) | docstring | Drop "Mirrors the Drizzle definition in `apps/web/src/db/schema.ts`" → describe the table directly |
| [apps/api/app/features/staff/service.py:7-8](../apps/api/app/features/staff/service.py#L7) | docstring | Drop "mirrors the legacy `ROLE_CHANGE` action so historical entries stay queryable" |
| [apps/api/app/features/staff/service.py:133](../apps/api/app/features/staff/service.py#L133) | docstring | Same — drop "Mirrors the legacy ROLE_CHANGE action" |
| [apps/api/app/features/guardians/model.py:3](../apps/api/app/features/guardians/model.py#L3) | docstring | Drop "Mirrors the Drizzle definition" |
| [apps/api/app/features/students/service.py](../apps/api/app/features/students/service.py) | docstring | ✅ resolved in B1 |
| [apps/api/app/features/schools/model.py:5](../apps/api/app/features/schools/model.py#L5) | docstring | Drop reference to "Alembic baseline (`fb2f367656c5_drizzle_baseline_port`)" |
| [apps/api/app/features/schools/schema.py:38](../apps/api/app/features/schools/schema.py#L38) | comment | Drop "These mirror the structures the Drizzle / Next-side already use" |
| [apps/api/app/features/schools/service.py:3](../apps/api/app/features/schools/service.py#L3) | docstring | Drop "Mirrors `apps/web/src/features/settings/actions/_helpers.ts`" |
| [apps/api/app/features/schools/router.py:68](../apps/api/app/features/schools/router.py#L68) | docstring | Drop "same shape as the legacy `SCHOOL_SETTINGS_UPDATE` rows" |
| [apps/api/app/features/school_terms/schema.py:29](../apps/api/app/features/school_terms/schema.py#L29) | comment | Drop "mirrors the Drizzle CHECK pattern" |
| [apps/api/app/features/audit/service.py](../apps/api/app/features/audit/service.py) | docstring | ✅ resolved in B3 (rewrote when columns went JSONB) |

### Keep — not actually "legacy" references

- `apps/api/app/core/security.py` — "legacy HS256" refers to a *real* legacy fallback path for older Supabase projects. Keep.
- `apps/api/app/core/roles.py:13` — "Mirror these exactly with the TypeScript constant `USER_ROLES`" — both sides remain authoritative; this is a sync warning, not a Drizzle reference. Keep but consider auto-generating from a single source.
- `apps/api/app/features/guardians/router.py:3` — "Mostly mirrors Staff" — internal consistency note. Keep.
- `apps/api/app/features/schools/tests/conftest.py:121` — "we mirror that" — refers to test pattern. Keep.

## B. Improvement opportunities — RESOLVED

All seven items resolved in the same PR:

| ID | Status | Where |
|---|---|---|
| **B1** | ✅ Done | Student slug prefix now derives from academic-year start (`_slug_prefix_for_year` in [students/service.py](../apps/api/app/features/students/service.py)). New test confirms `AY 2025/2026 → UHAS-2025-NNNN`. |
| **B2** | ✅ Done | Slug retry-on-collision extracted into [`app/core/slug.py:insert_with_sequential_slug`](../apps/api/app/core/slug.py). All three domains (staff, guardians, students) use it. |
| **B3** | ✅ Done | Alembic migration [`63bbd48d03f4`](../apps/api/alembic/versions/63bbd48d03f4_audit_log_before_after_text_to_jsonb.py) flipped `audit_log.before` / `after` from `Text` to `JSONB`. Model + service + tests updated; bare `json.dumps` step dropped. |
| **B4** | ✅ Done | The schema layer was already concrete (`GradingBand`, `ScoreWeights`, `NotificationDefaults` Pydantic models exist in [schools/schema.py](../apps/api/app/features/schools/schema.py)) — what needed fixing was the frontend. [`getSchoolSettings`](../apps/web/src/features/settings/queries/get-school-settings.ts) now uses the OpenAPI-generated types directly; the `as ScoreWeights \| null` cast is gone. |
| **B5** | ✅ Done | `_to_read` in [students/router.py](../apps/api/app/features/students/router.py) uses `model_copy(update=…)` — one Pydantic pass instead of validate/dump/validate. |
| **B6** | ✅ Done | `write_audit_log`'s `target_id` accepts `UUID \| str` directly; the awkward `isinstance(staff_id, UUID) else UUID(str(staff_id))` coercion at the call site is gone. |
| **B7** | ✅ Done | [`app/features/audit/actions.py`](../apps/api/app/features/audit/actions.py) constants + `AuditAction` Literal. `write_audit_log`'s `action` param now requires one of the closed set. Every service uses the constants. |

## C. Deferred notification triggers — ✅ RESOLVED in Phase 2 #9

All in-app triggers listed here were wired into their producer services
when the Notifications domain landed. Each service imports
`NotificationsService.notify_audience(...)` / `.notify_user(...)` and
fires inside the same transaction as the state change, so a producer
that rolls back leaves no orphan notifications. See the audience
resolver in [`apps/api/app/features/notifications/audience.py`](../apps/api/app/features/notifications/audience.py)
for the discriminated union of audience shapes.

**Retrofits shipped:**

| Domain | Trigger points | Kinds emitted |
|---|---|---|
| lesson_plans | `.submit`, `.review` | `lesson_plan_submitted`, `lesson_plan_advanced`, `lesson_plan_reviewed` |
| schemes | `.submit`, `.acknowledge` | `scheme_submitted`, `scheme_acknowledged` |
| assignments | `.publish` | `assignment_created` |
| promotions | `.open_season`, `.send_back` | `promotion_season_opened`, `promotion_sent_back` |
| announcements | `.create` (gated by `school.notification_defaults.on_announcement_posted`) | `announcement_posted` |

**Email delivery — deferred to Phase 3 (Storage/Jobs/SMS):**

The TS side had exactly one email trigger — lesson-plan rejection,
gated by `school.notification_defaults.on_lesson_plan_rejected`. Not
ported yet because Phase 3 stands up the Inngest job runner (per
[v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md)),
which is the right home for out-of-band delivery. Building an inline
Python email path now would just be thrown away when Phase 3 lands.
Until Phase 3:

  * Teachers still get the in-app notification on rejection.
  * The `notification_defaults.on_lesson_plan_rejected` setting is
    honoured by the TS side while it's still live.
  * Once we deprecate the TS layer we lose the email until Phase 3.
    Documented risk, low-impact.

## D. Post-port UX backlog — enriched review history for lesson plans

**Status:** deferred until every Phase 2 feature is ported.

**Background.** The `lesson_plans` row used to carry a single-review snapshot (`reviewed_by_id`/`reviewer_comment`/`reviewed_at`) that got overwritten on each review event — a Deputy Head approval wiped out the Unit Head's approval identity. The Phase 2 lesson-plans port introduced a dedicated [`lesson_plan_reviews`](../apps/api/app/features/lesson_plans/model.py) child table (one row per review event) with a "latest review" subquery join, so today the full history is preserved server-side but the API response still exposes only the latest reviewer for backwards compatibility with the existing UI.

**Backlog task.** Once the full port is done, surface the complete history in the UI:

- Add an endpoint (`GET /lesson-plans/{plan_id}/reviews`) returning the ordered review timeline: reviewer name + role + decision + comment + timestamp for each event.
- On the [`LessonPlanForm`](../apps/web/src/features/lesson-plans/components/LessonPlanForm.tsx) and the review-detail pane, render a timeline: "Submitted by *Teacher X* → Unit Head *Y* approved (comment) → Deputy Head *Z* approved (comment)".
- Keep the flat `reviewerComment`/`reviewedById`/`reviewedAt` fields on `LessonPlanRead` for the top-of-form badge, but source them from a dedicated `latestReview` object in the response so the shape is explicit.

This is UX polish, not a correctness fix — history is already recorded; we're just exposing it.
