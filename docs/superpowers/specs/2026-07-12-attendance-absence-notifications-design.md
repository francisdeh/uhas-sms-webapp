# Attendance absence notifications — design

PR 4 of the 4-part "close the email/SMS gaps app-wide" initiative (1: auth contact-info fixes, done; 2: appointments notifications + HTML email templates, done; 3: leave request notifications, done). Last PR in the originally-scoped set — a follow-up PR 5 (Admin leave management page) comes after this one, separately.

## Pre-design audit — ground truth

- `AttendanceService.upsert_session` (`apps/api/app/features/attendance/service.py`) is the **only** write path for student attendance — session-based, not per-student: it deletes every existing `AttendanceRecord` for a `(class_id, date)` `AttendanceSession` and re-inserts the full submitted class roster. No single-student "mark one" or "correct one" method exists; corrections happen by resubmitting the whole session.
- Zero notification code exists anywhere in this flow — no in-app, no email, no SMS.
- `NotificationKind.ATTENDANCE_ABSENT` and `SmsCategory.ABSENCE` are already reserved (defined, never referenced) — same "scaffolded ahead of time" pattern the leave-request kinds had before PR 3. `sms_fanout.py`'s own docstring names "absence alerts" as a deferred producer.
- `AttendanceStatus` (`apps/api/app/features/attendance/constants.py`) is `"Present" | "Absent" | "Late" | "Excused"`.
- Preference infrastructure (two-tier gate, shared Jinja2 email template system, generic multi-recipient SMS fan-out job, `ProfilePage.tsx`'s per-role preference-row pattern) is all built in PR 2/3 — only new usages needed here.

## Scope (decided)

- **Trigger status**: `"Absent"` only. `"Late"`/`"Excused"` stay silent.
- **Recipient**: primary guardian only (`StudentGuardian.is_primary`) — matches both existing precedents in this codebase (results-published email, fee-reminder SMS).
- **Direction**: single-direction (parent-facing only) — unlike appointments/leave, there's no staff-facing "activity" side, so this is one preference pair, not two.

## 1. Notification model + dedup

One preference pair: `user_preferences.email_on_attendance_absent` / `.sms_on_attendance_absent` (bool, default `true` — same as every other domain's per-user default; once a school opts in, individual guardians are opted in too, until they turn a channel off themselves). `schools.notification_defaults` gains `on_attendance_absent` — **default `false`**, the one deliberate exception to every other toggle in this initiative (all of which default `true`). Attendance is marked daily for potentially every student — a materially higher volume and more sensitive category (an absence pattern can reveal a family situation) than the occasional, ad-hoc events the other toggles gate — so a school opts in explicitly via Settings → Communication rather than this firing unannounced the moment the feature ships.

**Dedup is the core technical problem this PR solves.** Because `upsert_session` deletes and re-inserts the entire session on every save, a naive "notify on every `Absent` record in the new submission" would re-notify guardians on every resubmission of the same day's session (e.g. a teacher fixing a late-reason typo hours after the original save) — even though the student was already flagged absent. `upsert_session` will fetch the *previous* records into a `{student_id: status}` map before deleting them. A student triggers a notification only if:
- their new status is `"Absent"`, **and**
- their previous status (if a record existed) was not `"Absent"`.

This covers "newly marked absent" (no previous record, or previous record had a different status) and "flipped absent → present → absent again" (a real correction), while a same-day resubmission that leaves an already-absent student's status unchanged stays silent — the dedup key is the record's *status transition*, not a separate timestamp/cooldown field (unlike the fee-reminder's `last_reminder_sent_at`, which doesn't fit here since this event is genuinely one-shot-per-transition, not "still overdue after N days").

## 2. `AttendanceService` changes

Inside `upsert_session`, after computing the newly-absent student set (per the dedup rule above) and before/alongside the delete+reinsert:

1. Checks the school's `notification_defaults.on_attendance_absent` toggle once — skips the rest entirely if off.
2. For each newly-absent student, resolves their primary guardian via the same `StudentGuardian.is_primary` join the fee-reminder job uses. A student with no primary guardian on file is skipped (silent, same posture as every other domain).
3. Groups newly-absent students **by resolved guardian** — a guardian with two children in the same class both marked absent gets one combined notification, not two. (Batching is per-session-save, not globally across the day: if the same guardian's other child is marked absent in an unrelated class's separate session save, that's a second, separate notification — an accepted simplification given the session-based architecture; not worth a cross-session hold-and-combine mechanism for this edge case.)
4. For each guardian: writes one in-app `Notification` (`kind=ATTENDANCE_ABSENT`, body listing the child name(s)), then reuses the two-tier email/SMS channel-fan-out shape from `_notify_appointment_channels`/`_notify_leave_channels` (per-guardian pref check, best-effort `try/except` around both sends).
5. **Correction after checking `sms_fanout.py`'s actual code**: the job's event payload carries one shared `body` string applied to every phone in its `recipients` list — there's no per-recipient personalization. Since each guardian's message needs their own children's names, one `sms/fanout.requested` event per guardian (each with a single-entry `recipients` list) is required, not a single batched event across guardians — same shape as every other domain in this initiative. The "batching" is still real, just at the guardian level (their multiple children combined into one body), not across guardians.

## 3. Email template + Inngest job

One new template, `attendance_absent.html`, extending `base.html`:
- "Hi, {{ student_names }} {{ was_were }} marked absent today ({{ date }})." — `student_names`/`was_were` computed at the emit site (mirrors `results_published_email.py`'s existing `_format_children` helper for joining multiple names, and the singular/plural verb).
- No CTA button (nothing actionable, unlike appointments/leave) — just a plain link to the parent's attendance calendar view.

One new Inngest job, `attendance_absent_email.py`, mirroring `leave_requested_email.py`'s exact shape (pure "send what I'm told," no DB access). New `apps/api/app/features/attendance/jobs/__init__.py` exporting `ATTENDANCE_JOBS`, registered in `main.py`.

## 4. Frontend

- `NotificationDefaults` (schema + `apps/web/.../settings/types.ts`): add `onAttendanceAbsent`. `CommunicationTab.tsx` gains one new `NotifRow`.
- `MeRead`/`MeUpdate` schema: add `email_on_attendance_absent`/`sms_on_attendance_absent`.
- `SessionUser` TS type + `get-session-user.ts`: add the 2 new fields.
- `ProfilePage.tsx`'s `NotificationsTab`: `PARENT_PREFERENCE_ROWS` gains two new rows (email + SMS). No other role's rows change — the only PR in this initiative that doesn't touch Teacher/Admin/DeputyHead.

## Out of scope

- `"Late"`/`"Excused"` statuses — deliberately silent (see Scope).
- Notifying every guardian (not just primary) — deliberately out (see Scope); could be a future toggle if a school asks.
- Cross-session-save batching (e.g. combining a guardian's two children's absences across two different classes' separate saves into one message) — accepted simplification (see §2.3).
- A per-student "mark absent" endpoint distinct from the bulk session upsert — out of scope; not needed for this PR and no existing UI calls for it.

## Testing

- Backend: dedup logic (resubmitting an unchanged-absent session emits nothing; a student flipping `Absent → Present → Absent` across two saves re-notifies on the second flip; a brand-new `Absent` record with no prior record notifies); guardian batching (two children of the same guardian, same session, produce one email + one SMS listing both; two children of the same guardian in different session saves produce two separate notifications); the two-tier gate (school toggle off → nothing; per-guardian pref off → that channel skipped); no primary guardian on file → silent skip; the new email job renders + sends via a mocked provider.
- Frontend: no new Vitest coverage planned (matches convention).
