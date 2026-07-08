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
- Build the **full Scheme of Learning** template (dedicated table, 17 fields) with upload alternative.
- Replace appointment slot field with **named slots** ✅ done — `AppointmentSlot` is now `snack` / `lunch` / `after_school` with times shown on the frontend (Snack 10:00–10:20, Lunch 12:20–13:05, After School 15:05–15:45); the teacher-comment field (`teacher_response`) already existed. Seed-only data update, no migration (`preferred_slot` is a free `String(50)`). Design: `docs/superpowers/specs/2026-07-08-named-appointment-slots-design.md`.
- Add **Head/Deputy comments** on schemes ✅ done — schemes now carry a two-way `scheme_comments` thread (append-only, one row per comment, attributed + `clock_timestamp()`-ordered) replacing the single overwriting `reviewer_comment` column. `POST /schemes/{id}/comments` is open to the scheme's author (teacher) **and** its reviewers (Admin, own-division Deputy Head, own-division Unit Head) while the scheme is submitted or acknowledged; the acknowledge note joins the same thread. Each new comment fires a `scheme_commented` notification to the other side (author→unit heads, reviewer→author). Frontend: a shared `SchemeCommentThread` (timeline + comment box) on the admin review, teacher scheme view, and a new division-scoped `/deputy-head/schemes` page (+ sidebar nav). Migration `0be2e817bc16` backfills the old column into the thread. Design: `docs/superpowers/specs/2026-07-08-scheme-comments-design.md`. *(Lesson notes already have their own reviewer-comment flow; this item was scoped to schemes.)*
- Enforce **max-two guardians** + independent logins; surface **all guardians** + **sibling** links in the UI. Also model **staff-as-guardian** (staff have children at the school) — this is the natural home for the **staff-children marker + filter** (moved here from item 6, since it requires a student↔staff link that this item designs properly rather than a bare FK).
- Report card additions ✅ done — three additions to the student report card: (1) **vacation + reopening dates** sourced from `school_terms` (vacation = the exam term's `end_date`, reopening = the next term's `start_date`, with term 3 rolling to next academic year's term 1; null-safe when a term isn't set); (2) a **full-report** toggle that adds the CAT 1 / CAT 2 / Project / Group / Exam component columns (already in the payload, previously unrendered) on both the browser/print card and a `?full=true` PDF variant (folded into the PDF content hash so it never serves the wrong variant); (3) the **other-name** field — surfaced the existing `middle_name` column as "Other Name(s)" in the student create + edit forms (no schema change). Both renderers (`ReportCard.tsx` + `report_card.html`) updated in sync. Design: `docs/superpowers/specs/2026-07-08-report-card-additions-design.md`. *(Staff-children filter moved to the guardians item above — it's a roster/linkage concern needing a proper student↔staff link, not a report-card change.)*
- **Parent-facing published calendar** view.
- **Class-teacher view** of subject teachers with missing midterm/EoT records ✅ done — `GET /exams/{id}/score-completeness/{classId}` returns per-subject entered/roster counts + status (not_started / partial / complete) + the subject teacher's name (or "unassigned"); a "Score entry status" panel sits on the class-report page (`teacher/class-reports/[examId]/[classId]`) where the class teacher assembles the report. Pure new read, no schema change; gated to class teacher / Admin / own-division Deputy (reuses the class-report gate). Design: `docs/superpowers/specs/2026-07-08-missing-scores-view-design.md`.

**Done when:** each item in the Feature Status Register's "Partial" list is reconciled to its requirement.

---

## 9. Phase 5 — Procurement Features (New)

**Goal:** deliver the school's active ask — fees and parent SMS.

- **Accountant role** scoped to the finance domain (RLS: fee tables only).
- **Fee management:** fee items → learner fees → payments; assign/include/exclude learners; balances and arrears; receipts.
- **Parent fee view:** outstanding balances per ward.
- **Fee reminder SMS** via Hubtel (Inngest scheduled + on-demand).
- **Online payment (only if confirmed):** payment-gateway integration (Paystack or Hubtel pay), webhook reconciliation into `fee_payments`, idempotency via `payment_gateway_events`. If payment stays at the bursar, this stays dormant and tracking still works.

**Done when:** an accountant can define fees, assign them, record a payment, and a parent receives an SMS reminder and sees their balance.

> **Decision gate:** confirm with Mawuli/school whether the system processes payment before building the gateway portion. The tracking + SMS portion proceeds regardless.

---

## 10. Phase 6 — Depth & Polish

**Goal:** raise the shallow features to real-world depth.

Prioritised by what UHAS hits first (from the Feature Enhancements doc):

1. Student profile depth (siblings, all guardians, medical, documents) — parent-facing.
2. Audit log filters (user/target, CSV export) — cheap admin win.
3. Leave management (balances, types, documents, substitute) — monthly staff use.
4. Staff profile depth (hire date, qualifications, subject expertise, documents).
5. Report card polish: KG observational variant, conduct/co-curricular, class-average comparison, **batch print**, **email-to-parent** on publish.
6. **First-login onboarding checklist** — after a prod bootstrap (which seeds only the school row + config + subjects), the admin logs into a fresh instance and must configure the rest. A first-login checklist that walks the Admin through the remaining setup (school identity/branding, grading tweaks, academic year + term dates, create classes, invite staff) turns an empty instance into a guided setup. Optionally a lighter first-login checklist for other roles for any per-user setup (e.g. enable 2FA, set notification prefs). Complements the dev-vs-prod seed split (§8 follow-up).
7. **"Powered by SimplifyDLabs" attribution** — developer/agency wording + link in the relevant places (login-page footer, dashboard footer/about). Small branding item; slot in alongside the Phase 7 brand-verification pass.
8. **Appointment email + SMS + notification preferences** — in-app notifications for appointments already exist (`appointment_requested` to the teacher on create, `appointment_decided` to the guardian on respond). The gaps: (a) **email** delivery for those events (today the only real email path is the lesson-plan-rejection Inngest job), (b) **SMS** delivery (the SMS scaffolding — `sms_log` + `SmsProvider` interface, Hubtel stubbed — exists but has no appointment trigger; parents may prefer SMS for a confirmed/declined meeting), and (c) a **per-user preference** to opt in/out per channel — extend the existing `user_preferences` table (which holds only `email_on_lesson_plan_rejected` today, built to grow) with appointment flags, gated the same way (school default + per-user flag). More broadly, this is the general pattern of "in-app + email + SMS, each with per-user prefs, for each notification kind" — appointments are the first ask; announcements/results/leave could follow.

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
| Fee/payment scope grows (gateway, reconciliation) | Medium | Decision gate before gateway work; tracking-only path is independent |
| Lost test coverage during port | Medium | Tests travel with each domain; no domain "done" without pytest |
| Solo bandwidth / timeline slip | High | Phase boundaries are shippable; cut Phase 6 depth items first if needed |

---

## 13. Dependencies & Decisions Needed Before Starting

- **Confirm parent phone-login** with Mawuli (affects Phase 1 directly).
- **Confirm fee payment handling** — system-processed vs bursar (affects Phase 5 scope).
- **Hubtel account + sender ID** registered (needed by Phase 3).
- **Payment provider** chosen if online payment is confirmed (Paystack vs Hubtel pay).
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
