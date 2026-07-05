# Profile page completion — Notification preferences — design

**Date:** 2026-07-06
**Phase:** 3.5 — Platform completion & admin polish (Profile page completion, second sub-feature)
**Status:** Approved, ready for implementation

## Context

"Profile page completion" bundles five independent mocked features under one page (see the Save Changes design doc for the full breakdown). This covers the second: **Notification preferences**.

The `NotificationsTab` in `ProfilePage.tsx` currently shows three toggles ("Email — New Announcements", "Email — Attendance Alerts", "In-App Notification Sound"), all local `useState` — `toggle()` just flips state and toasts "Preference saved.", nothing persists. No `user_preferences` table exists anywhere in `apps/api`.

An audit of the actual current notification/email surface found none of the three toggles correspond to something real:
- **Announcements** are in-app only — no email path exists for them at all.
- **"Attendance alerts"** don't exist anywhere in the codebase, in-app or email.
- **In-app notification sound** — no sound-playing logic exists anywhere in `NotificationsDropdown.tsx`.

The entire real email-sending inventory in this codebase is one thing: the lesson-plan-rejection Inngest job (`apps/api/app/features/lesson_plans/jobs/rejection_email.py`), which emails the teacher whose plan was rejected. It's already gated by a school-level admin default (`schools.notification_defaults.on_lesson_plan_rejected`), checked in `lesson_plans/service.py`'s `_emit_rejection_email`. There's no per-user opt-out on top of that school default today.

The in-app notification feed (`apps/api/app/features/notifications/`, real, DB-backed, rendered by `NotificationsDropdown.tsx`) is a separate, already-working concern — nothing in this design touches it. It's gated only by the same school-level defaults, never a per-user preference; out of scope here.

## Goals

- Replace the three fictional toggles with the one real preference that actually exists: whether *this* teacher gets emailed when their own lesson plan is rejected, layered on top of the existing school-level default.
- Store it in a way that comfortably holds more preference flags later, without a schema change each time.

## Non-goals

- Building new trigger types (announcement emails, attendance alerts) just to give the old UI toggles something to gate — explicitly rejected in favor of matching what's real.
- Any change to the in-app notification feed's behavior or gating.
- The other three Profile-page sub-features (2FA, Active Sessions, self-deactivation).

## Architecture

### Storage

New `user_preferences` table: `user_id` (PK, FK → `users.id`), `email_on_lesson_plan_rejected: bool` (default `True`), `created_at`, `updated_at`. Chosen over a column on `users` (simpler for this one flag, but `users` is an identity/access table, not a preferences one) specifically because more preference flags are expected soon — a dedicated table avoids a schema migration each time one's added.

One row per user, created lazily — no row exists until a user actually changes a preference, so there's no backfill migration needed for existing users.

- **Read**: look up the row by `user_id`. If none exists, default `email_on_lesson_plan_rejected = True` in code — matches today's "everyone gets emailed unless they opt out" behavior exactly, so shipping this doesn't silently change anyone's experience.
- **Write**: upsert — insert a row if none exists yet, update it if one does.

### API

Extends the existing `/me` endpoint (built for the Save Changes sub-feature) rather than a new route — this is exactly as much "my own setting" as displayName/phone:
- `MeRead` gains `emailOnLessonPlanRejected: bool`.
- `MeUpdate` gains `emailOnLessonPlanRejected: bool | None = None`.
- `MeService.get()` looks up the caller's `user_preferences` row (defaulting to `True` if absent) alongside its existing `users`/`staff`/`guardians` reads.
- `MeService.update()` upserts the row when this field is present in the payload.

### Email-gating change

`lesson_plans/service.py`'s `_emit_rejection_email` currently checks only `school.notification_defaults.on_lesson_plan_rejected`. It now also looks up the teacher's `user_preferences` row (a new, small query — this only runs once per lesson-plan rejection, not a hot path) and requires **both** the school default and the per-user flag to be true before dispatching the email event. Defaults to sending (current behavior) when no preferences row exists for that teacher.

### Frontend

`NotificationsTab` drops all three existing toggles. Replaced with:
- **Teacher role** (including Unit Head, which is a flag on Teacher, not a separate role): one real toggle, "Email me when my lesson plan is rejected", wired to `api.me.update({ emailOnLessonPlanRejected })`, prefilled from `GET /me`.
- **Every other role** (Admin, DeputyHead, Parent — none of whom ever submit lesson plans, so none ever receive this email): a brief note that there's nothing to configure for their role yet, rather than an empty-looking tab.

## Error handling

- Same pattern as Save Changes: `toast.error` on `ApiError`, matching every other mutation in this codebase.
- No new error cases beyond what `/me` already handles (auth, no-linked-id) — this preference isn't tied to a linked staff/guardian row, so it works even for the `EMAIL_ONLY_USER` (no-linked-row) edge case already covered by existing `/me` tests.

## Testing

**Backend**:
- `MeService`/`PATCH /me` tests: setting `emailOnLessonPlanRejected` creates a `user_preferences` row; a second update on an existing row updates it rather than erroring; `GET /me` reflects the current value; defaults to `true` when no row exists yet.
- `lesson_plans` rejection-email tests: extend the existing gating test(s) to cover the new per-user check. Three cases, since "opted out" and "never touched the setting" must behave differently: (1) school default true + user has no preferences row yet → email sends (default-true behavior, unaffected by this change); (2) school default true + user explicitly set the flag false → email is suppressed; (3) school default false → email is suppressed regardless of the user's own preference (unchanged from today).

**Frontend**: no new test — matches the established precedent (no component-testing infra in this repo).

## Open questions

None outstanding — scope (one real toggle, matching actual behavior), storage shape (dedicated table per explicit user request), and the non-Teacher-role tab treatment were all explicitly decided during brainstorming.
