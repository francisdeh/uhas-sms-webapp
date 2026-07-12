# Leave request notifications — design

PR 3 of the 4-part "close the email/SMS gaps app-wide" initiative (1: auth contact-info fixes, done; 2: appointments notifications + HTML email templates, done; 4: attendance absence — later, separate PR).

## Pre-design audit — ground truth

- `LeaveRequestsService` (`apps/api/app/features/leave_requests/service.py`) has **zero** notification code anywhere — not `create` (submit), not `update_status` (approve/reject/cancel), not `update_substitute`. Confirmed via grep: no `NotificationsService` import, no `notify_audience`/`notify_user` call.
- `NotificationKind` already reserves `LEAVE_REQUEST_SUBMITTED` and `LEAVE_REQUEST_DECIDED` (`apps/api/app/features/notifications/constants.py`) — defined but never referenced anywhere else in the codebase, presumably scaffolded for this exact PR.
- Approver is Admin (school-wide) **or** Deputy Head (own division only, server-enforced via `_division_of`) — both simultaneously eligible, not a staged chain like lesson plans' Unit-Head-then-Deputy-Head.
- `_ALLOWED_TRANSITIONS`: `pending→{approved,rejected,cancelled}`, `approved→{cancelled}`.
- Preference infrastructure (two-tier gate, HTML email template system, generic SMS fan-out job, per-role `ProfilePage.tsx` preference rows) is all already built in PR 2 — no new scaffolding needed, only new usages of it.

## Scope (decided)

- **Events covered**: submit (→ approver notification) and decide/approve-reject (→ requester notification) only — matches the two already-reserved `NotificationKind`s. Cancel and substitute-assignment stay silent, same as today.
- **Preference granularity**: one pref pair per direction, mirroring PR 2 exactly — not a single combined toggle.
- **Recipient fan-out on submit**: per-approver email/SMS sends (not a batched single SMS event), consistent with the existing single-recipient `_notify_appointment_channels` shape reused per resolved approver.

## 1. Notification model

Two preference **directions**, reusing the two already-reserved `NotificationKind`s:

- **Approver-facing — "leave activity"**: fires on `create` (submit). New `user_preferences.email_on_leave_activity` / `.sms_on_leave_activity` (bool, default `true`).
- **Requester-facing — "leave decided"**: fires on `update_status`'s approve/reject. New `user_preferences.email_on_leave_decided` / `.sms_on_leave_decided` (bool, default `true`).

`schools.notification_defaults` gains matching `on_leave_activity` / `on_leave_decided` (bool, default `true`) — same coarser-school-toggle-plus-finer-per-user-pref shape as appointments. `SmsCategory` gains a new `"leave"` value (currently: `absence, results, fee_reminder, announcement, onboarding, appointment, other`).

## 2. `LeaveRequestsService` changes

**`create()` (submit)** — after the row is inserted, a new private helper `_notify_leave_approvers(session, school_id, *, requester, request_id, ...)`:
1. Checks the school's `notification_defaults.on_leave_activity` toggle once — returns early if off.
2. Resolves the actual approver `User` ids via the existing `resolve_audience()` primitive (`app/features/notifications/audience.py`), called with `StaffByDivisionAudience(division=requester.division, roles=[DEPUTY_HEAD])` and separately with `AllAdminsAudience()`, ids merged (no overlap possible — role is exclusive per account).
3. Writes one in-app `Notification` per resolved approver (`kind=LEAVE_REQUEST_SUBMITTED`), then — for each approver — re-uses the exact single-recipient channel-fan-out shape already proven in `_notify_appointment_channels` (per-user `email_on_leave_activity`/`sms_on_leave_activity` pref check, best-effort `try/except` around both `inngest_client.send` calls). This is a loop over N approvers, not a new batching mechanism — a school with 3 Deputy Heads + 2 Admins means up to 5 separate email sends and up to 5 SMS sends per submission, same cost profile as everywhere else in this codebase.
4. A resolved approver's phone comes from their linked `Staff.phone` (same join shape as `_notify_appointment_channels`'s teacher-phone resolution).

**`update_status()` (approve/reject only, not cancel)** — after the status flip + audit-log write, resolves the requester's linked `User` via `NotificationsService.find_user_for_linked` and calls the *same* `_notify_appointment_channels`-shaped single-recipient helper (direction `"decided"`, `kind=LEAVE_REQUEST_DECIDED`) — structurally identical to how `AppointmentsService.respond` notifies the guardian.

No notification code touches `update_status`'s `cancelled` branch or `update_substitute` — out of scope per the earlier decision.

## 3. Email templates + Inngest jobs

Two new content templates, both `{% extends "base.html" %}` (the shared layout from PR 2 — citrus top border, school-identity footer, "Manage email preferences" link):

- `leave_requested.html` — "Hi, {{ requester_name }} requested {{ leave_type }} leave from {{ start_date }} to {{ end_date }}." + optional `{{ reason }}` quote-block (mirrors `appointment_requested.html`'s optional-reason pattern) + CTA link to the leave request detail. Generic "Hi," greeting (not personalized per-approver) since a single email render is reused conceptually across N recipients via N separate job invocations — no need to thread each approver's own name through.
- `leave_decided.html` — "Your {{ leave_type }} leave request ({{ start_date }}–{{ end_date }}) was {{ action }}." + optional `{{ rejection_reason }}` quote-block (only present when declined) + CTA link.

Two new Inngest jobs, each mirroring `appointment_requested_email.py`'s exact shape (pure "send what I'm told," no DB access):
- `leave_requested_email.py` — `email/leave-requested.requested`
- `leave_decided_email.py` — `email/leave-decided.requested`

New `apps/api/app/features/leave_requests/jobs/__init__.py` exporting `LEAVE_REQUESTS_JOBS`, registered in `main.py`'s combined job list. No new SMS jobs — both reuse the existing generic `sms/fanout.requested` → `sms_fanout.py`, category `"leave"`.

## 4. Frontend

- `NotificationDefaults` (schema + `apps/web/.../settings/types.ts`): add `onLeaveActivity`, `onLeaveDecided`. `CommunicationTab.tsx` gains two more `NotifRow`s.
- `MeRead`/`MeUpdate` schema: add the 4 new per-user boolean fields (same round-trip shape as the appointment fields added in PR 2).
- `SessionUser` TS type + `get-session-user.ts`: add the 4 fields.
- `ProfilePage.tsx`'s `NotificationsTab`: extends the per-role `PreferenceRowConfig[]` list (built in PR 2) with `ADMIN_PREFERENCE_ROWS` and `DEPUTY_HEAD_PREFERENCE_ROWS` — the first rows either role has ever had (both previously fell through to "nothing to configure for your role yet"). Each shows *both* leave directions (activity + decided) since Admin/DeputyHead are staff too and can be either an approver on someone else's request or a requester on their own.

## Out of scope

- Leave-cancellation and substitute-assignment notifications — deliberately deferred (see Scope section above).
- PR 4 (attendance absence notifications) — separate, later PR, reusing the same infrastructure.
- Announcements' real email delivery, promotions/assignments/schemes email — still backlog items beyond this initiative.
- A batched/multi-recipient variant of the SMS fan-out helper — the existing per-recipient loop is simpler and consistent with the rest of the codebase; revisit only if a school's approver count ever makes per-recipient sends a real cost concern.

## Testing

- Backend: `_notify_leave_approvers` gating (school toggle off → nothing; per-approver pref off → that channel only skipped for that approver; multiple eligible approvers across Admin + Deputy Head all get notified; a division with no Deputy Head still notifies Admins); `update_status`'s decided-notification gating (mirrors the appointments `respond` tests); the two new email jobs render + send via a mocked provider (mirrors `test_jobs.py` from PR 2); no notification fires on cancel or substitute-assignment (explicit negative tests, since those paths still emit nothing by design).
- Frontend: no new Vitest coverage planned (matches convention — pure-logic utilities only, no component tests exist anywhere in this codebase).
