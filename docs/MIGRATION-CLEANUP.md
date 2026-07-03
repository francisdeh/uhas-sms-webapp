# Migration cleanup checklist

Phase 2 is complete — the Drizzle / Next-side Server Action layer was fully decommissioned in PR #32 (`chore/phase-2-cleanup`). This sweep is done.

## A. Pure-comment cleanup — ✅ RESOLVED

These were docstrings / inline comments that referenced "Drizzle", "legacy Server Action", or "mirrors X" — now stale and edited or removed.

| File | What was done |
|---|---|
| [apps/api/app/features/staff/model.py](../apps/api/app/features/staff/model.py) | ✅ Dropped the Drizzle-definition reference |
| [apps/api/app/features/staff/service.py](../apps/api/app/features/staff/service.py) | ✅ Dropped both "mirrors the legacy ROLE_CHANGE action" references |
| [apps/api/app/features/guardians/model.py](../apps/api/app/features/guardians/model.py) | ✅ Dropped the Drizzle-definition reference |
| [apps/api/app/features/students/service.py](../apps/api/app/features/students/service.py) | ✅ resolved in B1 |
| [apps/api/app/features/schools/model.py](../apps/api/app/features/schools/model.py) | ✅ Dropped the Alembic-baseline migration-hash reference |
| [apps/api/app/features/schools/schema.py](../apps/api/app/features/schools/schema.py) | ✅ Dropped "mirror the Drizzle / Next-side structures" |
| [apps/api/app/features/schools/service.py](../apps/api/app/features/schools/service.py) | ✅ Dropped the `settings/actions/_helpers.ts` reference |
| [apps/api/app/features/schools/router.py](../apps/api/app/features/schools/router.py) | ✅ Dropped "legacy Next-side Server Action" reference |
| [apps/api/app/features/school_terms/schema.py](../apps/api/app/features/school_terms/schema.py) | ✅ Dropped "mirrors the Drizzle CHECK pattern" |
| [apps/api/app/features/audit/service.py](../apps/api/app/features/audit/service.py) | ✅ resolved in B3 (rewrote when columns went JSONB) |

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

**Email delivery — ✅ RESOLVED in Phase 3.**

Lesson-plan rejection is the one email trigger the TS side had,
gated by `school.notification_defaults.on_lesson_plan_rejected`. Ported
onto the Inngest job runner: `LessonPlansService._emit_rejection_email`
emits `email/lesson-plan-rejected.requested` (best-effort — a failed
emit never fails the review itself), and
[`features/lesson_plans/jobs/rejection_email.py`](../apps/api/app/features/lesson_plans/jobs/rejection_email.py)
sends it via the provider-agnostic
[`integrations/email/provider.py`](../apps/api/app/integrations/email/provider.py)
(SMTP today; missing config logs + skips rather than erroring, same
contract as the old TS `lib/email.ts`).

## D. Post-port UX backlog — enriched review history for lesson plans

**Status:** deferred until every Phase 2 feature is ported.

**Background.** The `lesson_plans` row used to carry a single-review snapshot (`reviewed_by_id`/`reviewer_comment`/`reviewed_at`) that got overwritten on each review event — a Deputy Head approval wiped out the Unit Head's approval identity. The Phase 2 lesson-plans port introduced a dedicated [`lesson_plan_reviews`](../apps/api/app/features/lesson_plans/model.py) child table (one row per review event) with a "latest review" subquery join, so today the full history is preserved server-side but the API response still exposes only the latest reviewer for backwards compatibility with the existing UI.

**Backlog task.** Once the full port is done, surface the complete history in the UI:

- Add an endpoint (`GET /lesson-plans/{plan_id}/reviews`) returning the ordered review timeline: reviewer name + role + decision + comment + timestamp for each event.
- On the [`LessonPlanForm`](../apps/web/src/features/lesson-plans/components/LessonPlanForm.tsx) and the review-detail pane, render a timeline: "Submitted by *Teacher X* → Unit Head *Y* approved (comment) → Deputy Head *Z* approved (comment)".
- Keep the flat `reviewerComment`/`reviewedById`/`reviewedAt` fields on `LessonPlanRead` for the top-of-form badge, but source them from a dedicated `latestReview` object in the response so the shape is explicit.

This is UX polish, not a correctness fix — history is already recorded; we're just exposing it.
