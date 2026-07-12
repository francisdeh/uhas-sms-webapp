# Appointment notifications + HTML email templates — design

PR 2 of the 4-part "close the email/SMS gaps app-wide" initiative (1: auth contact-info fixes, done; 3: leave requests; 4: attendance absence — later, separate PRs).

## Pre-design audit — ground truth

- `AppointmentsService.create` (Parent→Teacher) and `.respond` (Teacher→Parent) each notify in-app only (`APPOINTMENT_REQUESTED`/`APPOINTMENT_DECIDED`). `.cancel` (Parent cancels their own appointment) has **zero notification of any kind**, not even in-app — the bug this PR fixes.
- `Appointment` model has no location/meeting-notes field — just `reason` (guardian's stated purpose, nullable) and `teacher_response` (teacher's decision note, nullable). Repository joins already resolve guardian/student/teacher names at every read call site.
- `EmailMessage` already supports `html=` alongside `text=`; `SmtpEmailProvider` already sends both parts via `MIMEMultipart("alternative")`. Enabling HTML is purely a call-site change — no provider code change needed.
- No email-specific Jinja2/HTML template exists anywhere in this codebase — the two existing email jobs (`lesson_plans/jobs/rejection_email.py`, `exams/jobs/results_published_email.py`) build plain f-string bodies inline. `exams/report_card_pdf.py`'s `Environment(loader=FileSystemLoader(...))` idiom is the pattern to reuse, minus the WeasyPrint step.
- `sms/jobs/sms_fanout.py` (generic, event-triggered fan-out job) already exists; `SmsCategory` needs a new `"appointment"` value.
- `user_preferences` has no SMS columns yet — this PR adds the first ones.
- `ProfilePage.tsx`'s `NotificationsTab` is a hard `user.role === TEACHER` ternary — Parent currently sees "There's nothing to configure for your role yet." Needs restructuring to a per-role row list.

## 1. Notification model

Two new `NotificationKind`s: `APPOINTMENT_CANCELLED` (in-app; `APPOINTMENT_REQUESTED`/`APPOINTMENT_DECIDED` already exist and are reused as-is for email/SMS gating too — no new kinds needed for those).

Two preference **directions**, not per-event-type (per scoping decision — 4 columns, not 6+):

- **Teacher-facing — "Appointment activity"**: covers both `create` (new request) and `cancel` (guardian cancelled) — both mean "something changed on your calendar, go look." New `user_preferences.email_on_appointment_activity` / `.sms_on_appointment_activity` (bool, default `true`).
- **Parent-facing — "Appointment decided"**: covers `respond`'s confirm and decline. New `user_preferences.email_on_appointment_decided` / `.sms_on_appointment_decided` (bool, default `true`).

School-level `notification_defaults` gains `on_appointment_activity` / `on_appointment_decided` (bool, default `true`) — coarser than the per-user prefs: one toggle per direction gates *both* channels at the school level (an Admin turns the whole notification kind off), while per-user prefs stay channel-specific (a teacher can keep email but mute SMS, or vice versa).

Gating logic (mirrors the existing lesson-plan-rejection/results-published two-tier pattern): school toggle checked once at the emit site; per-user email/SMS prefs checked per recipient. A recipient with no phone on file (teacher) or no confirmed phone (guardian) silently skips the SMS emit — same "missing contact info is not an error" posture as the rest of this codebase.

## 2. `AppointmentsService` changes

All three mutation methods (`create`, `respond`, `cancel`) call a new private helper `_notify_appointment_channels(session, school_id, *, recipient_user, direction, kind, title, body, sms_body, link)` right after their existing in-app `notify_audience`/`notify_user` call. The helper:
1. Checks the school's `notification_defaults` toggle for `direction` (`"activity"` or `"decided"`) — returns early if off.
2. If `recipient_user.email` and the recipient's `email_on_appointment_{direction}` pref (default `true` if no `user_preferences` row): best-effort emits `email/appointment-{event}.requested`.
3. Resolves the recipient's phone (teacher → `Staff.phone`; guardian → `Guardian.phone`, both already available from the same joined read) — if present and `sms_on_appointment_{direction}` pref allows: best-effort emits `sms/fanout.requested` with category `appointment`.

`cancel()` gains the missing in-app notification too — `notify_audience(..., UserAudience(user_id=teacher_user.id), NotifyPayload(kind=APPOINTMENT_CANCELLED, title="Appointment cancelled", body=f"{guardian} cancelled the meeting about {student}.", link="/teacher/appointments"))` — then the same three-channel helper.

## 3. HTML email templates

New `apps/api/app/integrations/email/templates/` directory + a module-level Jinja2 `Environment` (mirrors `exams/report_card_pdf.py`'s idiom, minus WeasyPrint):

- `base.html` — shared layout: simple header (school name), a styled call-to-action button/link, plain footer ("— UHAS SMS"). Inline CSS throughout (required for email-client compatibility — no `<style>` block, no external stylesheet).
- `appointment_requested.html`, `appointment_decided.html`, `appointment_cancelled.html` — new, each `{% extends "base.html" %}` with a `{% block content %}`.
- `lesson_plan_rejected.html`, `results_published.html` — the two existing plain-text jobs are retrofitted to render through this same system (their `text` body stays as the plain-text fallback part of the `MIMEMultipart`; `html` is now also populated).

New `apps/api/app/integrations/email/templates.py`: `render_email_template(name: str, **context) -> str`, a thin wrapper around `Environment.get_template(name).render(**context)` — the single call site every email job uses.

**Post-review revisions** (the first pass shipped internally, then got two rounds of user feedback before sign-off):
- Brand colors were initially guessed as a generic Tailwind emerald (`#047857`) instead of the project's actual `--brand`/`--accent-teal` tokens (`#1B6B3E` forest green, `#C7D52F` citrus yellow) — corrected across all 6 template files.
- The header banner (solid green bar + "UHAS Basic School" wordmark) was removed entirely per user feedback ("too much for an email") — replaced with a plain 4px `#C7D52F` top border on the card. In its place, `base.html` gained a real footer: the school's name, address, and contact email (`school.email`, falling back to `school.email_reply_to`), plus a "Manage email preferences" link pointing at the recipient's own role-scoped profile tab (`/teacher/profile?tab=notifications` or `/parent/profile?tab=notifications` — there's no real unsubscribe mechanism, so this points at the actual toggle instead of faking one). These 4 fields (`school_name`, `school_address`, `school_contact_email`, `preferences_link`) are merged into every outbound email's event `data` at the same emit site that already resolves the `notification_defaults`/`user_preferences` gate, not duplicated per call site.
- Body font switched from Georgia serif (borrowed from the PDF report card's print aesthetic) to a system sans-serif stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`) — email clients (Outlook chief among them) can't load the app's actual `next/font/google` Plus Jakarta Sans webfont, so a native-OS sans stack approximates the app's sans-serif identity far better than a mismatched serif fallback would.
- `email_on_results_published` — a `user_preferences` column that already existed (from the exams results-published feature) but was never exposed through `MeRead`/`MeUpdate`/`SessionUser`, leaving Parents with zero way to opt out — got surfaced now as a drive-by fix while the same `NotificationsTab` restructure (below) was already in flight for Parent's new appointment rows.

## 4. New Inngest jobs + events

Three new jobs under `apps/api/app/features/appointments/jobs/`, each mirroring `rejection_email.py`'s shape exactly (pure "send what I'm told," no DB access, gating already done at the emit site):

- `appointment_requested_email.py` — `email/appointment-requested.requested`
- `appointment_decided_email.py` — `email/appointment-decided.requested`
- `appointment_cancelled_email.py` — `email/appointment-cancelled.requested`

No new SMS jobs — all three reuse the existing generic `sms/fanout.requested` → `sms_fanout.py`, category `"appointment"`.

New `apps/api/app/features/appointments/jobs/__init__.py` exporting `APPOINTMENTS_JOBS`, registered in `main.py`'s job list.

## 5. Frontend

- `NotificationDefaults` (schema + `apps/web/.../settings/types.ts`): add `onAppointmentActivity`, `onAppointmentDecided`. `CommunicationTab.tsx` gains two more `NotifRow`s, and its section description now notes it gates SMS too, not just email.
- `MeRead`/`MeUpdate` schema: add the 4 new per-user boolean fields (mirrors `email_on_lesson_plan_rejected`'s existing round trip through `MeService.get`/`.update`), plus `email_on_results_published` (drive-by fix, see §3).
- `SessionUser` TS type + `get-session-user.ts`: add all 5 fields.
- `ProfilePage.tsx`'s `NotificationsTab`: replaced the hard `user.role === TEACHER` ternary with a per-role `PreferenceRowConfig[]` list rendered by a shared `PreferenceRow` component (each row owns its own optimistic-toggle state, keyed by a `PreferenceField` union type) — Teacher sees "Lesson Plan Rejected" (existing, unchanged) + "Appointment Requests" (email + SMS rows); Parent sees "Results Published" (newly exposed) + "Appointment Responses" (email + SMS rows); other roles keep the "nothing to configure" fallback.

## Out of scope

- Announcements' real email delivery, promotions/assignments/schemes email — still backlog items beyond this initiative.
- PR 3 (leave requests) and PR 4 (attendance absence) — separate, later PRs, though both will reuse the `render_email_template`/template-base-layout infrastructure built here.
- A meeting-location/notes field on `Appointment` — doesn't exist today, not part of this PR's scope (notification content only).
- SMS delivery-status callbacks/webhooks — `SmsService.send` already treats the provider's synchronous response as final (`sent`/`failed`), unchanged by this PR.

## Testing

- Backend: `_notify_appointment_channels` gating (school toggle off → no email/SMS either channel; per-user pref off → that channel only skipped; no phone/email on file → silently skipped, no error) for all three directions (request, decide, cancel); `cancel()`'s new in-app notification; the three new email jobs render + send via a mocked provider (mirrors `test_rejection_email.py`); `render_email_template` produces non-empty HTML containing expected interpolated values, for all 5 templates (3 new + 2 retrofitted); `SmsCategory` gains `"appointment"` with no migration needed (no DB check constraint, established precedent from PR 1).
- Frontend: no new Vitest coverage planned (matches convention — pure-logic utilities only, no component tests exist anywhere in this codebase).
