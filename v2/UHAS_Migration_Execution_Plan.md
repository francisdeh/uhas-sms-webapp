# UHAS Basic School SMS — Migration & Execution Plan

**Version:** 1.0
**Date:** June 2026
**Prepared by:** Simplifyd Labs Ltd
**Companions:** FRD v2.0, Feature Status Register, Data Model v2.0, Backend Architecture v1.0

---

## 1. Purpose

This document sequences the move from the current demo build (Next.js Server Actions + Neon Postgres + Firebase Auth/Storage) to the target architecture (Next.js frontend + FastAPI backend + Supabase Postgres/Auth/Storage + Inngest + Hubtel), and then the addition of the new requirement features.

It is a **demo-phase migration**: there is no production data to protect and no live users to disrupt, which is why a full backend migration is sensible to do now rather than later. The plan is written for a small team (effectively solo-plus) and ordered to keep risk isolated.

---

## 2. Guiding Principles

- **Auth is the riskiest piece — migrate it alone.** Never mix the auth cutover with feature work.
- **Port domain by domain.** Each domain (students, attendance, exams, …) moves as a vertical slice: repository → service → router → tests → frontend repoint.
- **Keep the system runnable at every step.** The frontend can talk to old Server Actions for un-migrated domains and the new API for migrated ones during transition, or — given demo phase — a clean cutover per domain is acceptable.
- **Tests travel with the code.** A domain isn't "done" until its pytest coverage exists.
- **New features come after the core is stable on the new stack**, not interleaved with the migration.

---

## 3. Phases at a Glance

| Phase | Theme | Outcome |
|---|---|---|
| 0 | Foundation | FastAPI + Supabase projects stood up; schema baselined |
| 1 | Auth migration | Supabase Auth live; JWT pipeline; phone login for parents |
| 2 | Core domain port | All existing domains running on FastAPI + Supabase |
| 3 | Storage + jobs + SMS | Supabase Storage, Inngest, Hubtel wired |
| 3.5 | Platform completion + admin polish | Real report-card PDFs, Admin Settings page, Profile page completion, rate limiting |
| 4 | Requirement gaps | Partial → Done (subjects, SoL, slots, report fields, etc.) |
| 5 | Procurement features | Fees, SMS notices, Accountant role |
| 6 | Depth + polish | Leave, profiles, audit filters, KG reports, batch print |
| 7 | Hardening + handover | Tests green, docs current, demo-ready |

---

## 4. Phase 0 — Foundation

**Goal:** the new stack exists and the schema is in place, nothing ported yet.

- Create the Supabase project (Postgres + Auth + Storage). Record keys in Railway env (never client-side).
- Stand up the FastAPI skeleton per the Backend Architecture structure (`app/core`, `app/db`, `app/deps`, `app/features`, `app/integrations`, `app/jobs`, `tests`).
- Port the existing Drizzle schema into Postgres as the **Alembic baseline migration**. From here, Alembic owns migrations.
- Wire SQLAlchemy 2.0 session/engine; health-check endpoint; CI runs `pytest` + lint on PRs.
- Deploy the empty FastAPI service to Railway alongside the Next.js app.

**Done when:** FastAPI is deployed, connects to Supabase Postgres, CI is green, and the schema matches the Data Model baseline.

---

## 5. Phase 1 — Auth Migration (highest risk, isolated)

**Goal:** identity runs on Supabase Auth end to end.

- Stand up Supabase Auth: email/password for staff and admins; **phone (E.164) sign-in for parents** *(pending confirmation with Mawuli)*.
- Re-anchor the `users`/profiles table to `auth.users.id`; carry `role`, `school_id`, `linked_id`.
- Write `role` and `school_id` into JWT `app_metadata` at sign-in.
- Build the FastAPI JWT verification (Supabase JWKS), `get_current_user`, `require_role`, and scope-guard dependencies — replacing `proxy.ts`.
- Implement phone normalisation (E.164) and duplicate handling for guardians.
- Seed the role accounts (Admin, Deputy Heads ×4, Unit Head, Teacher, Parent, **Accountant**).
- Migrate the force-password-change and reset flows.

**Done when:** every role can log in through Supabase, JWTs verify in FastAPI, scope guards work, and an integration test proves cross-scope access is denied.

**Rollback posture:** until this phase passes its tests, the demo continues on Firebase Auth. Do not delete the Firebase path until Phase 2 begins.

---

## 6. Phase 2 — Core Domain Port

**Goal:** all existing functionality runs on FastAPI + Supabase, feature-for-feature.

Port in dependency order. Each domain is a vertical slice: `repository.py` → `service.py` (business logic moved out of the old Server Action) → `router.py` → Pydantic `schemas.py` → pytest → repoint the frontend calls.

**Suggested order (dependencies first):**

1. Schools / settings / terms (config everything else needs)
2. Staff + Students + Guardians (people)
3. Classes / Subjects / Class-subjects / Enrollments (structure)
4. Attendance (sessions + records) + Staff attendance
5. Exams + Scores (carry the grade/weight computation into the service — **verify all CAT/Group/Project weights** while here)
6. Lesson plans + Schemes (review chain)
7. Assignments
8. Promotions (transactional enrolment creation)
9. Announcements + Notifications
10. Calendar + Appointments
11. Audit log + Reports

**Done when:** every existing feature works on the new stack, RLS policies are in place per table, and each domain has passing unit + integration tests. The Firebase/Server-Action paths can now be removed.

---

## 7. Phase 3 — Storage, Jobs, SMS

**Goal:** the platform plumbing is complete.

- **Storage:** move file handling to Supabase Storage — photos public-read, documents via signed URLs. Migrate any demo files.
- **Inngest:** wire the job runner; implement the first jobs as no-op-safe stubs (report generation, SMS fan-out, cleanup) so triggers exist before heavy logic.
- **Hubtel:** implement the `SmsProvider` interface with Hubtel; register sender ID; log every send to `sms_log`; wire the delivery callback.
- **Email:** confirm the provider-agnostic email path on the new stack.

**Done when:** files upload/serve from Supabase, a test SMS sends and logs via Hubtel, and Inngest jobs run on trigger.

**Status:** platform plumbing is scaffolded — Storage, Inngest, and the `SmsProvider` interface + `sms_log` table all exist. Hubtel itself is still a stub (no account/sender-ID yet), and the report-generation job writes a placeholder instead of a real PDF — both carried forward into Phase 3.5 below rather than blocking on them here.

---

## 7a. Phase 3.5 — Platform Completion & Admin Polish

**Goal:** finish the loose ends Phase 3 scaffolded but didn't complete, plus the two admin-facing pages already scoped and waiting, before moving on to new requirement work.

- **Real report-card PDF rendering ✅ done** — `GET /students/{id}/report-card/pdf` renders the existing report-card template (Jinja2 port of `ReportCard.tsx`) to real PDF bytes via WeasyPrint, cached in Supabase Storage keyed by a content-hash of the assembled data (publish state doesn't actually lock scores/remarks, so caching couldn't key off that). `apps/api` now builds via its own Dockerfile (WeasyPrint's system libraries) instead of the `railpack` builder. Batch/bulk printing remains explicitly out of scope — separate, larger, deferred work.
- **Admin Settings page ✅ done** — an audit found `/admin/settings` (Identity / Calendar / Grading / Communication / Security / Branding) already fully built from earlier work, contrary to the stale pre-migration spec this item was scoped against. The real gap was narrower: `grading_bands`/`score_weights` were already correctly consumed server-side by score computation, but the score-entry live preview and the report-card/PDF grading-key legend still hardcoded the GES defaults instead of reading the school's actual settings — both fixed. `session_timeout_minutes` removed outright (Supabase Auth controls session expiry, not this app — the column was unenforceable). `password_min_length`/`force_password_change_on_first_login` are now read-only in the UI since neither is wired to real enforcement.
- **Profile page completion ✅ done** — Save Changes ✅, Notification preferences ✅, self-service deactivation ✅, Active Sessions ✅ (reframed to "sign out other devices" — Supabase exposes no per-session list), 2FA/TOTP ✅ (Supabase Auth MFA: enrol from Profile, login-time challenge, un-bypassable proxy `/verify-2fa` gate, admin `reset-mfa` for lockout recovery since Supabase has no backup codes).
- **Rate limiting audit ✅ done** — the original assumption above (audit login + OTP endpoints) didn't hold: there is no login/password/OTP endpoint in FastAPI at all — Supabase Auth handles that entirely client-side, and the SMS-sending feature has no public HTTP trigger either. Every route requires a verified JWT except `/health`. Added `slowapi` with a global 300/min-per-user default plus a stricter 10/min limit on the report-card PDF endpoint (the one route with a real cost profile — synchronous WeasyPrint rendering on a cache miss). Keyed by authenticated user id (from the JWT), not IP — `uvicorn` isn't configured to trust Railway's `X-Forwarded-For`, and since every limited route already requires auth, per-user keying sidesteps that gap entirely. In-memory storage today (correct for the current single Railway instance); `REDIS_URL` is wired and documented for whenever `apps/api` scales to multiple replicas.

**Done ✅:** report cards render as real PDFs, rate limiting exists on the routes that need it, and the Admin Settings + Profile pages are fully wired (no UI-only stubs — the last one, 2FA, shipped with a real Supabase-MFA enrol/challenge/enforce flow).

**Explicitly deferred to Phase 7:** Postgres RLS policies and Locust load testing — tracked there, not here (see §12 and §15).

---

## 8. Phase 4 — Close Requirement Gaps (Partial → Done)

**Goal:** the system matches the school's refined requirements.

- Seed the **11 Common Core subjects** ✅ done — the school's confirmed curriculum is seeded per division (KG 7, Lower Primary 9, Upper Primary 9 [same as Lower], JHS 11) in `apps/api/app/scripts/seed/academic.py`, names verbatim, all `category="Core"`. Design: `docs/superpowers/specs/2026-07-08-common-core-subjects-design.md`. *(Note: the subject list is reference data a prod deploy also needs — surfaced the dev-vs-prod seed-strategy split as a follow-up.)*
- Full Scheme of Learning template ✅ done — the backlog's "17 fields" turned out to be aspirational FRD spec, not what the school actually uses; confirmed directly with the product owner (Mawuli) and a real sample document that the true template is a termly document with **one row per week** and just 6 columns: Week, Strand, Sub-strand, Content Standard, Indicators, Resources. Built as a new child table `scheme_weekly_entries` under `schemes` (type="learning") — extending `schemes`, not `lesson_plans`, per explicit product-owner confirmation (Lesson Note = Lesson Plan/weekly; Course Outline = Scheme of Work/termly — the two stay distinct domains). Only `week` is required per row, so a teacher can save a partially-filled week. `resources` supports **multiple file attachments** (a JSONB list of storage paths — a new `schemes/resource` upload kind, reusing the existing upload/signed-URL infra) alongside free text, since teachers attach photos/documents of teaching resources. Strand/Sub-strand/Content Standard/Indicators stay free text for now — a curriculum-seeded picker is a real future direction once the full GES curriculum is available per subject, explicitly deferred. Entries are editable only while the scheme is `draft` and owned by the caller (matching the existing scheme workflow untouched); submitting a Scheme of Learning requires ≥1 weekly entry or the existing whole-document upload alternative. `type="work"` (Scheme of Work) is completely unaffected. Design: `docs/superpowers/specs/2026-07-09-scheme-of-learning-template-design.md`.
- Replace appointment slot field with **named slots** ✅ done — `AppointmentSlot` is now `snack` / `lunch` / `after_school` with times shown on the frontend (Snack 10:00–10:20, Lunch 12:20–13:05, After School 15:05–15:45); the teacher-comment field (`teacher_response`) already existed. Seed-only data update, no migration (`preferred_slot` is a free `String(50)`). Design: `docs/superpowers/specs/2026-07-08-named-appointment-slots-design.md`.
- Add **Head/Deputy comments** on schemes ✅ done — schemes now carry a two-way `scheme_comments` thread (append-only, one row per comment, attributed + `clock_timestamp()`-ordered) replacing the single overwriting `reviewer_comment` column. `POST /schemes/{id}/comments` is open to the scheme's author (teacher) **and** its reviewers (Admin, own-division Deputy Head, own-division Unit Head) while the scheme is submitted or acknowledged; the acknowledge note joins the same thread. Each new comment fires a `scheme_commented` notification to the other side (author→unit heads, reviewer→author). Frontend: a shared `SchemeCommentThread` (timeline + comment box) on the admin review, teacher scheme view, and a new division-scoped `/deputy-head/schemes` page (+ sidebar nav). Migration `0be2e817bc16` backfills the old column into the thread. Design: `docs/superpowers/specs/2026-07-08-scheme-comments-design.md`. *(Lesson notes already have their own reviewer-comment flow; this item was scoped to schemes.)*
- Guardians + siblings + staff-as-guardian ✅ **all 3 slices done** — split into 3 dependency-ordered slices (the guardian↔student link surface was entirely missing; links existed only via the seed script):
  - **Slice 1 — guardian & sibling management ✅ done.** New link surface (`GET/POST/PATCH/DELETE /students/{id}/guardians`, `GET /students/{id}/siblings`) with app-layer **max-two** enforcement, constrained `relation` set, display-only **primary** badge (setting one clears others), and audit-logged `GUARDIAN_LINKED`/`GUARDIAN_UNLINKED`. Add supports **create-new or link-existing** (linking an existing guardian to a second student is what makes siblings). Registration now captures a required first guardian; the student-detail **Guardian tab** lists all guardians + add/unlink/edit-relation/set-primary + a **Siblings** section (replacing the hard-coded `guardian = null`). Reads gated Admin + own-division Deputy; mutations Admin-only. No migration. Design: `docs/superpowers/specs/2026-07-08-guardian-sibling-management-design.md`.
  - **Slice 2 — guardian logins + co-guardian view ✅ done.** A guardian login is now provisioned from whatever the guardian has: phone → `phone`+`phone_confirm` set (SMS-OTP capable, no password), email → invite, both when both, neither → 400. The phone-only path uses `create_user` (Supabase invite is email-only); the closed Supabase admin wrapper gained `phone`/`phone_confirm` across Protocol + real + not-configured + test fake. Shared `UsersService.provision_login` backs `POST /guardians/{id}/login` (Guardian-tab trigger) and the phone-aware `POST /users` (Parent email now optional; staff still require email). One-login-per-guardian is app-layer (409). `users.email` made nullable (migration `32cd865749cc`). `StudentGuardianRead.hasLogin` drives a login-status badge + "Create login" action. A **parent can now see the co-guardians of their own child** (name, relationship, contact) on `/parent/children` — `list_guardians` opened to a parent linked to the student (siblings stay Phase 6). User-creation is now audit-logged (`USER_CREATED`). Design: `docs/superpowers/specs/2026-07-08-guardian-logins-design.md`. *(Out of scope: real prod SMS delivery — a Supabase SMS-provider deploy config; DB-level `linked_id` uniqueness.)*
  - **Slice 3 — staff-as-guardian + staff-children filter ✅ done (final slice).** `guardians.staff_id` (nullable FK → `staff.id`, indexed; migration `4d512eb4c75b`) marks a guardian record as staff-backed — one guardian identity per staff member, enforced app-layer (find-or-reuse by `staff_id`, so re-picking the same staff member for a second child never duplicates). `GuardianField` gained a third **"From staff"** tab: picking a staff member auto-fills name + phone (email left blank on purpose — avoids a login-provisioning email collision with their existing staff account) into the editable create form, or switches to link mode if that staff member already has a guardian record. `GuardianCreate.staffId` + `GET /guardians?staffId=` back this; a dedupe collision with an *unrelated* guardian record surfaces a staff-specific 409 rather than silently merging. `StudentGuardianRead.isStaff` drives a "Staff" badge on the Guardian tab. Admin students list gained a **server-side `staffChild` filter** (`GET /students?staffChild=true`, joined + `.distinct()`-safe for students with two staff-backed guardians). No new audit action (reuses `GUARDIAN_LINKED`). Design: `docs/superpowers/specs/2026-07-09-staff-as-guardian-design.md`. *(Out of scope, noted in Phase 6 item 10: a "go to guardian portal" switcher for staff-as-guardians — needs a multi-role identity or session-exchange mechanism, a separate project. Also out of scope: a reverse "also a guardian of" view on the staff profile page.)*
- Report card additions ✅ done — three additions to the student report card: (1) **vacation + reopening dates** sourced from `school_terms` (vacation = the exam term's `end_date`, reopening = the next term's `start_date`, with term 3 rolling to next academic year's term 1; null-safe when a term isn't set); (2) a **full-report** toggle that adds the CAT 1 / CAT 2 / Project / Group / Exam component columns (already in the payload, previously unrendered) on both the browser/print card and a `?full=true` PDF variant (folded into the PDF content hash so it never serves the wrong variant); (3) the **other-name** field — surfaced the existing `middle_name` column as "Other Name(s)" in the student create + edit forms (no schema change). Both renderers (`ReportCard.tsx` + `report_card.html`) updated in sync. Design: `docs/superpowers/specs/2026-07-08-report-card-additions-design.md`. *(Staff-children filter moved to the guardians item above — it's a roster/linkage concern needing a proper student↔staff link, not a report-card change.)*
- Parent-facing published calendar view ✅ done — audit found the parent calendar route, hook, component, nav link, and backend read permission **already existed and worked** (`GET /calendar` was already open to Parent, already tested; there's no draft/unpublished concept in the model — every Admin-created event is immediately visible, which is what "published" meant). The one real gap: `school_terms` (term start/end dates) and `calendar_events` were two disconnected data sources — nothing showed a parent (or anyone) when a term begins/ends unless an Admin manually duplicated it as an event. Added a shared `getCalendarWithTerms()` query helper that merges `calendar_events` with read-only synthetic `term_start`/`term_end` entries derived from `school_terms` (types that already existed in `CalendarEventType` but nothing populated). Wired into **all four** calendar pages (admin/teacher/deputy-head/parent), not just parent, per request — `CalendarView`'s existing type-coded badges already rendered `term_start`/`term_end` correctly with zero changes needed. Synthetic entries are flagged `isSynthetic` so Admin's delete button doesn't render for them (they have no real `calendar_events` row). No migration, no backend changes at all — purely a frontend merge. Design: `docs/superpowers/specs/2026-07-09-parent-calendar-view-design.md`. *(Out of scope, confirmed not wanted: a real draft/publish toggle on CalendarEvent; a month-grid calendar visual — the existing Upcoming/Past list stays.)*
- **Class-teacher view** of subject teachers with missing midterm/EoT records ✅ done — `GET /exams/{id}/score-completeness/{classId}` returns per-subject entered/roster counts + status (not_started / partial / complete) + the subject teacher's name (or "unassigned"); a "Score entry status" panel sits on the class-report page (`teacher/class-reports/[examId]/[classId]`) where the class teacher assembles the report. Pure new read, no schema change; gated to class teacher / Admin / own-division Deputy (reuses the class-report gate). Design: `docs/superpowers/specs/2026-07-08-missing-scores-view-design.md`.

**Done when:** each item in the Feature Status Register's "Partial" list is reconciled to its requirement.

---

## 9. Phase 5 — Procurement Features (New)

**Goal:** deliver the school's active ask — fees and parent SMS.

> **Decision gate closed:** parents will not pay online — payment stays at the school (Accountant records it after collection). This removes the payment-gateway portion from scope entirely, permanently, not just deferred. `payment_gateway_events` / `PaymentProvider` are not built.

Decomposed into sequential slices (each its own spec + PR):

- ✅ **Slice 1 — Fee tracking core** (`docs/superpowers/specs/2026-07-09-fee-tracking-core-design.md`): `RequireAccountant` dep; `fee_items` → `learner_fees` → `fee_payments` (no gateway tables); bulk-assign a fee item to its scope's roster (school/division/class) with individual edit/waive/exclude after; Accountant records payments with multiple optional receipt-file uploads (no receipt generation — the Accountant uploads what they already collected); balances/arrears list; Accountant dashboard overview (`/accountant`) + fee-items/roster/balances pages (`/accountant/fee-items`, `/accountant/fee-items/[id]`, `/accountant/balances`). Service-layer auth only, consistent with every other domain (no RLS this slice — see Risk Register).
- ✅ **Slice 2 — Parent fee view** (`docs/superpowers/specs/2026-07-09-parent-fee-view-design.md`): `GET /fees/my-children` — a Parent's own children (resolved via the existing `StudentsService.list_for_guardian` ownership check, no new pattern) with per-child total owed/outstanding, a per-fee breakdown, and payment history. Deliberately narrower response schemas (`Parent*Read`) than the Accountant-facing ones — no recorder identity, no receipt files. `/parent/fees`, a pure Server Component (fully read-only, no client JS needed).
- ✅ **Slice 3 — Fee reminder SMS** (`docs/superpowers/specs/2026-07-09-fee-reminder-sms-design.md`): real `HubtelSmsProvider` (Quick Send API, HTTP Basic auth, config-gated — falls back to the stub until a real Hubtel account is registered; `respx`-mocked tests). This codebase's first `inngest.TriggerCron` job and first "sweep every school" job — weekly (Mondays 07:00), reminds each overdue fee's *primary* guardian with a phone on file, one SMS + one in-app notification per guardian even with several overdue fees, 6-day idempotency cooldown. On-demand send was explicitly rejected (abuseable) — scheduled only. `learner_fees.last_reminder_sent_at` surfaces on the Accountant dashboard + balances table.

**Done when:** an accountant can define fees, assign them, record a payment (✅ Slice 1), and a parent receives an SMS reminder (✅ Slice 3) and sees their balance (✅ Slice 2). **Phase 5 complete.**

---

## 10. Phase 6 — Depth & Polish

**Goal:** raise the shallow features to real-world depth.

Prioritised by what UHAS hits first (from the Feature Enhancements doc):

1. ✅ **Student profile depth** (`docs/superpowers/specs/2026-07-09-student-profile-depth-design.md`) — done. A pre-design audit found siblings + all-guardians display were already ~90% built (siblings only needed a parent-bypass on the existing `list_siblings` gate, mirroring `list_guardians` — no schema/repository changes). Medical info (`students.blood_type`/`medical_notes`/`emergency_contact_name`/`emergency_contact_phone`) and a `student_documents` child table (labelled, accountable-uploader — not a bare JSONB path array) were genuinely new. Both get their own gated endpoints (`GET`/`PATCH /students/{id}/medical`, `GET`/`POST`/`DELETE /students/{id}/documents`) rather than folding into `StudentRead`, since implementation surfaced that `GET /students/{id}` has no role/ownership gate at all — embedding sensitive fields there would leak them to any authenticated user in the school. Medical view: Admin/Deputy(own division)/Teacher(teaches the class)/own-parent; medical edit + document upload/delete: Admin or the student's own parent (medical) / Admin only (documents) — matching this feature's existing Admin-only-mutation precedent. New `/parent/children/[id]` detail page.
2. ✅ **Audit log filters** — done. `audit_log` already had `user_id`/`(target_table, target_id)` indexes, so no migration was needed. Added `userId`/`targetTable`/`targetId` params to `GET /audit-log` (mirrors the existing `action`/date-range pattern), `GET /audit-log/actors` (distinct actors actually present in the school's log, not the full directory), and `GET /audit-log/export` (CSV, unpaginated — first CSV-export precedent in this codebase). Admin-only throughout.
3. ✅ **Leave management depth** (`docs/superpowers/specs/2026-07-12-leave-management-depth-design.md`) — done. A third distinct audit outcome, half right/half wrong: leave types + the request/approve workflow already existed; balances, documents, and substitute cover were genuinely 0% built. The audit also surfaced three unrelated bugs, fixed in the same PR by explicit direction: a Deputy Head division-scope leak (any Deputy Head could view/approve/reject leave for staff in *any* division, despite a code comment falsely claiming otherwise); a rejection-reason field collected in the UI but silently discarded, never sent to the backend; and no audit-log write on approve/reject (new `LEAVE_DECIDED` action). New: `leave_requests.document_urls` (bare JSONB array — always requester-uploaded at creation, no labelled-child-table ambiguity like `student_documents`/`staff_documents`); `leave_requests.substitute_staff_id` (simple informational annotation, not a schedule/`class_teachers` override); Casual-leave balance computed on the fly from `schools.casual_leave_annual_days` (new Admin-configurable Settings "Leave" tab) minus the inclusive day-count of that staff member's approved Casual requests so far in the current UTC calendar year — deliberately not a maintained counter, so it can't drift from source data. Only Casual-style leave draws against a balance; the other six leave types (Sick, Maternity, Paternity, Study, Compassionate, Other) don't.
4. ✅ **Staff profile depth** (`docs/superpowers/specs/2026-07-10-staff-profile-depth-design.md`) — done. Unlike the student-profile audit, this one confirmed the backlog was accurately scoped: genuinely ~0% built (no `hire_date`, no qualifications, no subject-expertise link, no staff documents beyond `photo_url`). Added `staff.hire_date`; a `staff_subject_expertise` join table (open read, Admin-only full-replace `PUT /staff/{id}/subjects` — a simple tag list distinct from `class_subjects.teacher_id`'s current-assignment meaning); a `staff_qualifications` child table (open read, Admin-only add/remove); a `staff_documents` child table mirroring `student_documents`'s shape, but gated tighter than the rest of this feature's open-read precedent — `GET /staff/{id}/documents` is Admin-any-or-self-only, since certificates/contracts are more sensitive than a hire date or subject tag. New "Qualifications" tab on the Admin staff-detail page; a read-only "My Documents" section on the self-service `/profile` page. Also fixed an unrelated pre-existing flaky test (`test_school_stats_admin`) found along the way — the fixture computed "today" in the machine's local timezone while `ReportsService._today()` correctly uses UTC, a ~2-hour daily window where they'd disagree.
5. ✅ **Report card polish** (`docs/superpowers/specs/2026-07-12-report-card-polish-design.md`) — done, shipped as one combined PR covering all five sub-items. A ground-truth audit found all five genuinely 0% built (two had partial groundwork: free-text remarks existed but no structured conduct/co-curricular fields; class rank existed but no class-average). KG observational variant: `student_report_remarks.kg_observations` (JSONB, 5 fixed domains) replaces the numeric score table entirely for `division == KG` students. Conduct/co-curricular: `conduct_ratings` (4 fixed traits) + `interests_co_curricular`, every division. Class-average: same-class-and-exam `AVG(total_score)` joined into each score row. Batch print: resurrects the dormant placeholder-only Inngest job pair (deleted) as a real `exams/jobs/report_card_batch.py` reusing the single-student PDF renderer's content-hash cache, zips the results, tracks status on a new `report_card_batch_jobs` table for async polling. Email-to-parent on publish: wires the previously-dead `RESULTS_PUBLISHED` notification kind — one in-app notification per child, one batched email per primary guardian (listing all their newly-published children), gated by the school's notification toggle + a new per-user email preference, same two-tier gate as lesson-plan-rejection.
6. ✅ **First-login onboarding checklist** — done. Full write-up in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) under "First-time-setup onboarding checklist"; see also `docs/superpowers/specs/2026-07-14-onboarding-checklist-design.md`. Built as a persistent, auto-hiding Admin dashboard widget (not a wizard) with 5 live-computed checks (identity, grading, academic calendar, classes, staff) — no stored completion flag. The lighter per-user checklist for other roles (2FA, notification prefs) stays a separate, deferred future item.
7. ✅ **"Built by SimplifydLabs" attribution** — done. Shared `BuiltByAttribution` component (`apps/web/src/components/`), linked to https://simplifydlabs.com, used in the login-page footer and the dashboard sidebar footer (no existing dashboard-wide footer/about page to hook into, so the persistent sidebar chrome was the natural spot).
8. **Close the email/SMS gaps, app-wide** — expanded scope after a full audit found the gap was much bigger than "appointments": a table of every notification-worthy event (lesson plans, schemes, announcements, attendance, results, leave requests, promotions, assignments, appointments, fees) showed most have in-app only, no email or SMS; `announcements`' "email a copy" toggle turned out to not exist in code at all (not even wired, let alone broken); `appointments.cancel` had zero notification of any kind (not even in-app); `results_published`'s email opt-out preference exists on the backend but no frontend UI ever sets it; and a generic, already-built `sms/jobs/sms_fanout.py` fan-out job sat unused with nothing emitting to it. Scoped into 4 sequential PRs:
   - ✅ **PR 1 — Auth contact-info fixes** — done. Real bugs fixed alongside the SMS-provider groundwork, for BOTH phone and email (the email half was added mid-PR after checking whether the app "fully supports email and phone for parents" surfaced the identical bug on the email side): editing a phone or email (self-service Profile, or Admin editing a guardian/staff row) updated only the local `guardians`/`staff` mirror column, never Supabase Auth's own value — meaning OTP login (phone) or password login (email) silently kept authenticating against the *old* value after a "successful" change. Self-service phone goes through Supabase's own `updateUser({phone})` → `verifyOtp({type: "phone_change"})` round trip, then a new `POST /me/phone/confirm` mirrors back only what Supabase itself already confirmed. Self-service email is link-based (no inline code) — `updateUser({email})` sends a confirmation link, and `POST /me/email/confirm` (called best-effort on every profile-page load) mirrors the change once the user clicks it, into both `users.email` (the actual login-controlling field) and the linked guardian/staff row. Admin-driven edits (either field) sync directly via the Admin API, trusted the same way Admin is already trusted to set them at account creation — `SupabaseAdminClient.update_user_by_id` gained an `email_confirm` param to match `phone_confirm`. Also: phone-only accounts (the common Parent case) got zero notice their account exists — now emits to the existing `sms/fanout.requested` job on account creation, unconditional (transactional, no opt-out); new `app/core/phone.py` Ghana-format normalizer (`0XX…`/`233XX…`/`+233XX…` → canonical `+233XX…`) applied to every guardian/staff phone write; switched the active SMS provider to Arkesel (`ArkeselSmsProvider`, precedence over the existing Hubtel integration, falls back to it if only Hubtel is configured) per the school's provider choice; added "this is also your login" UI notes to the Profile phone/email fields and the Admin guardian/staff creation forms so an Admin doesn't assume a phone/email typed there is just a contact record. See `docs/superpowers/specs/2026-07-12-auth-contact-info-fixes-design.md`.
   - ✅ **PR 2 — Appointments notifications** — done. Fixed the `cancel()`-notifies-nobody bug (now in-app + email + SMS, matching `create`/`respond`) and built this codebase's first HTML email template system: `apps/api/app/integrations/email/templates/` (Jinja2 `Environment`, a shared `base.html` every content template extends) retrofits the two pre-existing plain-text-only jobs (lesson-plan-rejected, results-published) with HTML alongside their existing plain-text fallback, plus 3 new appointment email jobs. Two preference **directions**, not per-event-type: teacher-facing "appointment activity" (`create` + `cancel`) and parent-facing "appointment decided" (`respond`) — new `user_preferences.{email,sms}_on_appointment_{activity,decided}` columns (this codebase's first per-user SMS preferences) plus matching `schools.notification_defaults` toggles, same two-tier gate as lesson-plan-rejection. A user design review after the first pass caught two real issues: brand colors were a generic guess (`#047857`) instead of the project's actual `--brand`/`--accent-teal` tokens (`#1B6B3E`/`#C7D52F`, now correct), and the header banner was "too much for an email" — replaced with a plain citrus-accent top border plus a proper footer (school name/address/contact email pulled from the `schools` row, and a "Manage email preferences" link into the recipient's own role-scoped profile tab, since there's no real unsubscribe mechanism). Email body font is a system sans-serif stack — the app's actual `next/font/google` webfont can't load in most email clients (Outlook especially), so a native-OS sans stack approximates the brand better than falling back to the PDF report card's Georgia serif. Drive-by fix: `email_on_results_published` existed as a `user_preferences` column since the report-card-polish PR but was never exposed through `/me` — Parents had zero UI to opt out; wired through now alongside the new appointment prefs. `ProfilePage.tsx`'s `NotificationsTab` restructured from a hard `user.role === TEACHER` ternary to a per-role preference-row list (Parent previously saw "nothing to configure for your role yet"). See `docs/superpowers/specs/2026-07-12-appointment-notifications-design.md`.
   - ✅ **PR 3 — Leave request notifications** — done. Wired the two already-reserved `NotificationKind`s (`LEAVE_REQUEST_SUBMITTED`/`_DECIDED`, defined but never used since some earlier scaffolding pass) into `LeaveRequestsService`: `create()` (submit) now fans out to every eligible approver — every Deputy Head of the requester's division plus every Admin, both simultaneously eligible (not a staged chain like lesson plans' Unit-Head-then-Deputy-Head) — via `resolve_audience()` merged across `StaffByDivisionAudience(roles=[DeputyHead])` and `AllAdminsAudience()`, each resolved approver getting its own in-app notification + email + SMS (per-recipient, not batched — consistent with the rest of the codebase's cost profile). `update_status()`'s approve/reject branch notifies the requester, structurally identical to `AppointmentsService.respond`. Two new preference directions (`{email,sms}_on_leave_{activity,decided}`, one pref pair per direction, same shape as appointments) — the first prefs `ProfilePage.tsx`'s `NotificationsTab` has ever shown Admin or Deputy Head (both previously fell through to "nothing to configure," despite being staff who can submit their own leave too — both roles now see all 4 leave rows, since either role can be an approver on someone else's request and a requester on their own). Cancel and substitute-assignment stay silent by explicit scope decision (with negative tests proving it). Surfaced a real gap along the way: the backend already lets Admin approve/reject leave (`_APPROVER_ROLES = {ADMIN, DEPUTY_HEAD}`) but no `/admin/leave` page exists in the frontend at all — only `/deputy-head/leave` and `/teacher/leave` do. Admin can only act via a raw API call today; this PR's email CTA for an Admin recipient falls back to `/admin/staff` rather than inventing frontend scope here. **Building a real `/admin/leave` page is tracked as a follow-up PR, planned last in this initiative** (after PR 4). See `docs/superpowers/specs/2026-07-12-leave-request-notifications-design.md`.
   - ✅ **PR 4 — Attendance absence notifications** — done, last of the originally-scoped 4. `AttendanceService.upsert_session` is session-based (deletes + re-inserts a whole class roster on every save, no per-student mark/correct method), so the core problem this PR solves is dedup: fetches the previous session's records into a `{student_id: status}` map before the delete, and only a genuine status *transition into* `"Absent"` (new record, or previous status wasn't Absent) notifies — a same-day resubmission that leaves an already-absent student unchanged stays silent, while `Absent → Present → Absent` genuinely re-notifies. Recipient resolution follows the results-published/fee-reminder precedent exactly: primary guardian only, batched — a guardian with two newly-absent children (same class, same session save) gets one combined email + one combined SMS, not two. `"Late"`/`"Excused"` stay silent by scope decision; only `"Absent"` triggers. Single-direction (parent-facing only, no approver side) — just one preference pair, `{email,sms}_on_attendance_absent`. **The one deliberate default flip in this whole initiative**: `schools.notification_defaults.on_attendance_absent` defaults to `false`, not `true` like every other toggle — attendance is marked daily for potentially every student, a materially higher volume and more sensitive category (an absence pattern can reveal a family situation) than the occasional appointments/leave/results events, so a school opts in explicitly rather than this firing unannounced the moment the feature ships. See `docs/superpowers/specs/2026-07-12-attendance-absence-notifications-design.md`.
   - ✅ **PR 5 — Admin leave management page** — done, last of the initiative. Built `/admin/leave` by reusing `LeaveRequestList` as-is (no role-specific logic existed in it — the backend already scopes `GET /leave-requests` to Admin-sees-everyone vs Deputy-Head-sees-own-division, so the frontend just calls the same endpoint with no extra params) plus a new optional `scopeDescription` prop for the empty-state copy ("your school" vs "your division"). **Scope grew mid-PR**: researching the Admin gap surfaced a bigger one — none of Admin, Deputy Head, or Teacher's sidebar nav configs (`apps/web/src/features/shell/role-config.ts`) had a "Leave" entry at all, meaning `/deputy-head/leave` and `/teacher/leave` (both already fully built, working pages) had been completely unreachable through the UI since they shipped — no link anywhere pointed to them. Fixed all three in this PR, not just Admin's. Verified end-to-end in a real browser (not just `tsc`/`lint`/`build`) across all three roles with live seeded data: nav entries render, Admin sees both divisions' requests, Deputy Head (JHS) correctly sees only their own division's, Teacher's own submit-and-view flow works, zero console errors.
   - Announcements' real email delivery, promotions, assignments, and schemes email stay backlog items beyond this initiative for now.
9. **UI refinement pass** — polish the visual design of selected sections of the app (the ones that read as functional-but-plain), refining them with Claude-driven design (the `frontend-design` skill) for a more distinctive, intentional look while staying within the existing Tailwind v4 tokens + shadcn primitives and the UHAS brand palette. Pick the highest-traffic / most-parent-facing surfaces first; treat this as a design pass, not a rebuild.
10. **Guardian-portal switcher for staff-as-guardians** (strongly optional, not important now) — once a staff member also has a guardian identity (item 5 slice 3), let them jump from their staff dashboard to their guardian/parent view without a separate login. Today a login is one role + one linked identity per Supabase auth account, so this needs either a unified multi-role identity (JWT shape, routing, session handling) or an account-switch/session-exchange mechanism — a real, separate project, not a quick add. Slice 3 already lays the groundwork (a cheap `staff_id`-backed lookup to detect "this staff member is also a guardian").
11. **Pre-go-live gap audit + follow-ups** — a 65-agent audit workflow swept the codebase (orphaned routes, unwired backend constants/enums, endpoints with no frontend consumer, dead code, hardcoded values, comment rot, speculative abstractions) ahead of go-live, plus a separate backlog of items the user flagged directly (onboarding checklist, dashboard data depth, academic-year/term management, search nav, promotions, staff/parent onboarding email, parent fee receipts). Sequenced by production-blocking risk and blast radius, not raw severity count — cheap/no-design-decision fixes first, then anything that blocks actually onboarding real users, then foundational data model work, then everything downstream of it.
    - ✅ **Tier 1 — cheap audit fixes** — done. Full write-up in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) under "Pre-go-live gap audit — tier 1 cleanup".
    - ✅ **Tier 2 — Account emails: real provider + branded invite/reset/change** — done. Full write-up in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) under "Account emails: real provider + branded invite/reset/change"; see also `docs/superpowers/specs/2026-07-13-account-emails-provider-design.md`.
    - ✅ **Tier 3 — Action-button + page-layout consistency pass** — done, not part of the original audit list but grown mid-stream from the user's own follow-on asks after tier 2 shipped. Full write-up in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) under "Action-button + page-layout consistency pass"; see also `docs/superpowers/specs/2026-07-13-action-button-consistency-design.md`.
    - ✅ **Tier 4 — Follow-on bug sweep (staff email/login, UUID leaks, Documents card, staff phone login, profile photo, Settings buttons)** — done. Full write-up in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) under "Tier 4 follow-on bug sweep"; see also `docs/CHANGELOG.md` for the per-item detail. Six items flagged by the user in one batch, each independently investigated before any fix: admin-editing a staff member's email turned out to be **already safe** (syncs straight to Supabase Auth via the trusted admin API, no code change needed); UUID leaks were fixed via a new shared breadcrumb-label mechanism plus per-page one-line/plumbing fixes; the Profile "Documents" card got explanatory copy (it was working, just unlabeled); staff phone-login — found to genuinely work end-to-end today despite CLAUDE.md documenting it as Parent-only — is now actually restricted to Parents in `LoginForm.tsx`; self-service profile-photo upload (two real bugs: silently missing for staff with no linked record, and a broken `linkedId.startsWith("STAFF-")` check that meant the sidebar/header never showed a real photo for anyone) was removed in favor of initials-only avatars everywhere, since Admin-set staff/student photos elsewhere were unaffected and already worked; the Admin Settings page's 6 Save buttons (missed by tier 3's sweep) now use `variant="brand"`.
    - ✅ **Academic-year / term management deep-dive** — done. Full write-up in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) under "Academic-year / term management deep-dive"; see also `docs/superpowers/specs/2026-07-14-academic-year-term-management-design.md`. Closed the last of the six originally-flagged items. Deleted the hardcoded `ACADEMIC_YEARS` array that silently blocked class/exam creation (and the app's own recognition of its current year) once the real year advanced past it; added an explicit Admin-only "Prepare next year" (copies classes + shifts term dates forward, idempotent) / "Activate next year" (guarded on the promotion season being closed, audit-logged) rollover workflow; made `current_term` auto-computed from real `school_terms` dates with a manual override (was purely cosmetic before); fixed the parent dashboard's hardcoded Sept–Aug date range and exam creation's always-Term-1 default. A code-review pass caught the attendance class picker showing a raw UUID instead of its name — the same `SelectValue`-without-render-function bug class as the Calendar tab's own term selector, fixed earlier in this PR — which prompted a full app-wide sweep that found and fixed 11 total instances (see `docs/CHANGELOG.md` for the full list).
    - ✅ **First-time-setup onboarding checklist** — done. Full write-up in [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) under "First-time-setup onboarding checklist"; see also `docs/superpowers/specs/2026-07-14-onboarding-checklist-design.md`.
    - Remaining backlog (not yet sequenced into a PR): dashboard data enrichment/validation, search navigation revisit, promotions revisit, parent-facing fee receipts, and the medium/low-severity audit findings not covered by tier 1 (unwired enum values, endpoints with no frontend consumer, response fields never read by the frontend) — to be folded into whichever future PR naturally touches that area.

**Done when:** the chosen depth items are shipped; remaining ones are explicitly deferred.

---

## 11. Phase 7 — Hardening & Handover

**Goal:** demo-ready and maintainable.

- Full pytest suite green (unit + integration + RLS tests).
- Optional Playwright E2E for critical flows (login, attendance, score entry, fee payment).
- Update the handover brief and the companion docs to reflect FastAPI + Supabase.
- Seed a clean demo dataset; verify the brand (UHAS green/yellow, logo) throughout.
- Deploy checklist: env/secrets, Supabase RLS enabled, Hubtel sender ID live, domain configured.

**Done when:** a fresh collaborator can run the system locally and the demo runs end to end on the new stack.

---

## 12. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Auth migration breaks role/scope routing | Medium | Isolate in Phase 1; integration tests for every role before proceeding |
| Phone-login decision reverses after build | Medium | Confirm with Mawuli **before** Phase 1; keep guardian email column as fallback |
| Score weight wiring was silently defaulting | Medium | Verify + test during Phase 2 exams port |
| RLS misconfiguration leaks cross-scope data | Low–Med | Dedicated RLS tests; service layer as primary guard |
| RLS still unenforced anywhere in the codebase (fee tables included) | Low–Med | Deferred as a dedicated future hardening slice, not bundled into fee tracking; service-layer auth matches every other domain today |
| Lost test coverage during port | Medium | Tests travel with each domain; no domain "done" without pytest |
| Solo bandwidth / timeline slip | High | Phase boundaries are shippable; cut Phase 6 depth items first if needed |

---

## 13. Dependencies & Decisions Needed Before Starting

- **Confirm parent phone-login** with Mawuli (affects Phase 1 directly).
- ✅ **Fee payment handling confirmed:** bursar-collected, not system-processed. Payment-gateway work is out of scope permanently, not just deferred.
- **Hubtel account + sender ID** registered — `HubtelSmsProvider` code is done (Phase 5 Slice 3); it's config-gated and falls back to the stub until real credentials are set, so this is purely an account-registration dependency, not code.
- **ORM confirmation** — SQLAlchemy 2.0 + Alembic recommended (Backend Architecture §5.1).
- **Scheme of Learning** — dedicated table (recommended) vs extending lesson_plans.

---

## 15. Load Testing

To be carried out after Phase 7 (Hardening & Handover) before any public launch or onboarding of additional schools beyond the pilot.

### What to test

The school's realistic peak is all teachers logging in around the same time (7:30am) to mark attendance — approximately **60 concurrent users**. Beyond that, results-publishing day is the next spike: parents and teachers all hitting the system within a short window after the Head publishes.

Key scenarios to simulate:

| Scenario | Concurrent users | Why |
|---|---|---|
| Morning attendance rush | ~55 (all teachers) | Daily peak; most frequent |
| Results published — parent read | ~150–200 (parents + teachers) | Termly spike; highest read load |
| Batch report card generation | 1 admin trigger, heavy server | PDF rendering is compute-heavy |
| Fee reminder SMS fan-out | 1 trigger, ~350 SMS queued | Inngest job throughput |
| Simultaneous score entry | ~50 (all teachers, midterm) | Write-heavy burst |

### Tooling

**Locust** (Python) is the natural fit given the FastAPI backend — test scripts are plain Python, they can share Pydantic schemas with the app, and `uv run locust` fits the existing tooling convention.

```
tests/
└── load/
    ├── locustfile.py        # Task sets per scenario
    ├── users.py             # Role-specific user behaviours
    └── README.md            # How to run + interpret results
```

### Targets

| Metric | Target |
|---|---|
| p95 response time (reads) | < 500ms under peak load |
| p95 response time (writes) | < 1,000ms under peak load |
| Error rate | < 0.5% at 200 concurrent users |
| Batch report generation (350 students) | completes within 5 minutes via Inngest |
| Zero memory leaks or connection pool exhaustion | sustained 30-minute run |

### When to run

- After Phase 7 on staging with a realistic seeded dataset (350 students, 50 staff, 3 terms of data).
- Before onboarding any school beyond the pilot.
- Re-run after any significant architectural change (e.g. adding a second school, enabling online payments).

### If targets are not met

Common fixes at this stack and scale: connection pool tuning (SQLAlchemy pool size), adding a Redis cache for hot reads (class lists, settings), moving heavier report generation earlier in the Inngest job rather than on-demand, and ensuring RLS policies use indexed columns.

- All existing features run on FastAPI + Supabase with passing tests.
- New requirement gaps closed; procurement features (fees + SMS) live.
- RLS enforced; auth on Supabase; storage on Supabase; jobs on Inngest; SMS on Hubtel.
- Documentation current; demo dataset clean; brand applied.
- The Firebase + Server-Action paths fully retired.

---

*End of Migration & Execution Plan.*
