# Fee Reminder SMS — Design

**Phase 5, Slice 3** (final slice) of `v2/UHAS_Migration_Execution_Plan.md` §9. Slices 1 (fee tracking core) and 2 (parent fee view) are merged; this closes out Phase 5.

## Decisions

- **No Hubtel credentials exist yet.** `HubtelSmsProvider` is built structurally correct against Hubtel's public Quick Send API contract, config-gated via `HUBTEL_CLIENT_ID` / `HUBTEL_CLIENT_SECRET` / `HUBTEL_SENDER_ID` env vars — same "missing config isn't an error" contract as the email integration. `get_sms_provider()` falls back to the existing `StubSmsProvider` until all three are set; no caller changes when real credentials land.
- **No on-demand "send reminder now" button.** Explicitly rejected — an Accountant-facing send button "could be abused" (repeatedly nudging the same family). This slice ships the weekly scheduled job only.
- **Visibility into "when did we last remind":** since there's no on-demand button to check against, both the Accountant dashboard (school-wide "reminders last sent" timestamp) and the balances/roster table (per-fee "last reminded" column) surface `learner_fees.last_reminder_sent_at` — a single column of truth per fee, not a full per-attempt audit log (that already exists in `sms_log` if ever needed).
- **Also posts an in-app notification.** A new `fee_reminder` `NotificationKind`, delivered via the existing `NotificationsService.notify_user(...)` — a parent sees it in-app regardless of whether the SMS lands.
- **Reminder eligibility**: overdue only (`status` outstanding/partial AND `due_date` in the past) — not every unpaid balance, so fees not yet due aren't nagged about. Texts the *primary* guardian only (`StudentGuardian.is_primary`), so a student with two guardians on file gets exactly one text per fee.
- **One SMS per guardian, not per fee.** A guardian with several overdue fees (own multiple children, or one child with several overdue items) gets a single combined text, to avoid multi-text spam in one run.
- **Idempotency**: a fee already reminded within the last 6 days is skipped, so an Inngest retry or manual re-trigger within the same week doesn't double-text a household.
- **Message body is plain ASCII** ("GHS 123.45", not "GH₵123.45") — a non-GSM-7 character would push the whole SMS into UCS-2 encoding, cutting the per-segment length from 160 to 70 chars and likely doubling Hubtel's per-message cost for no readability gain.

## Backend

**Migration**: `learner_fees.last_reminder_sent_at` (nullable `DateTime`).

**`app/integrations/sms/provider.py`**: adds `HubtelSmsProvider` alongside the existing `StubSmsProvider`. `GET https://smsc.hubtel.com/v1/messages/send` with `From`/`To`/`Content` query params, authenticated via HTTP Basic (not the query-param credential variant Hubtel also supports, to keep secrets out of URLs that might land in logs). Success is `{"Status": 0, "MessageId": "..."}`; any other status, non-2xx, or network error maps to `failed`. Tested against mocked HTTP (`respx` — new dev dependency, first HTTP-mocking precedent in this codebase) since there's no live account to send against.

**`app/features/fees/repository.py`**: `find_overdue_for_reminder(...)` — the eligibility query (overdue, unpaid, primary guardian with a phone, not reminded within the cooldown window). `summary(...)` extended to also return the school-wide max `last_reminder_sent_at`.

**`app/features/fees/service.py`**: `send_overdue_reminders(session, school_id, *, provider=None)` — the actual logic (fully unit-testable via the standard rollback-isolated `db_session` fixture + an injectable fake `SmsProvider`, same DI pattern `SmsService.send` already supports). Groups eligible rows by guardian, composes one message per guardian, calls `SmsService.send(...)` + `NotificationsService.notify_user(...)`, stamps `last_reminder_sent_at` on every included `learner_fees` row.

**`app/features/fees/jobs/fee_reminder.py`**: this codebase's first `inngest.TriggerCron`-triggered job (every prior job is `TriggerEvent`-triggered) — `0 7 * * 1` (Mondays 07:00 UTC = 07:00 Ghana time year-round, no DST). Sweeps every active school (first "iterate all schools" job in this codebase — `SchoolsRepository.list_active_ids()` is new) and calls `FeesService.send_overdue_reminders` per school, mirroring `sms_fanout.py`'s thin-job-wrapping-a-service-method shape: the job opens its own `SessionLocal()` (Inngest jobs run outside any HTTP request) and commits; the actual logic it wraps has full test coverage elsewhere, so the job's own test only proves registration + cron trigger, matching `sms/tests/test_jobs.py`'s established convention.

## Frontend

- Accountant dashboard (`/accountant`): a small "Reminders last sent {date}." line under the page subtitle, sourced from `FeesSummary.lastReminderSentAt`.
- `LearnerFeesTable` (shared by the fee-item roster and balances views): new "Last reminded" column.
- No new pages, no new client mutations — this slice is read-only on the frontend (the reminder itself is server/cron-driven, not something a user triggers).

## Explicitly out of scope

- On-demand reminder button — rejected due to abuse potential; may be revisited later with rate-limiting if wanted.
- A full per-attempt reminder history UI — `sms_log` already has it if ever needed; not surfaced in the UI this slice.
- Hubtel delivery-status webhook — `HubtelSmsProvider` resolves `sent`/`failed` synchronously from the Quick Send response; there's no callback endpoint to later promote a row to `delivered`, same limitation the `SmsProvider` Protocol's docstring already notes.
