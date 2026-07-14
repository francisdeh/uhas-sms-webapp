# First-time-setup onboarding checklist — design

Backlog item from `v2/UHAS_Migration_Execution_Plan.md` Phase 6 item 6 (unchecked — the one item in that phase not yet done) and Phase 7 item 11's remaining backlog. Unusually well pre-specified: Phase 6 item 6 already names the concrete step list, and the demo/reference-seed split already defines the "prod bootstrap does X, the rest is Admin UI" boundary this checklist starts from.

## Pre-design audit — ground truth

- **No onboarding/setup-guidance UI exists anywhere today** — confirmed via full-codebase grep for onboarding/getting-started/checklist. The only things that "set up" a school are (a) `apps/api/app/scripts/seed_reference.py`, a one-time, prod-safe, idempotent ops CLI script that seeds only the `schools` row + config + subject curriculum (explicitly not classes — "left to the existing UI," per its own design doc), and (b) unordered, unguided manual use of ordinary Admin CRUD pages for everything else.
- Real dependency chain, confirmed via FK relationships and each domain's router: school row → academic year + `school_terms` (Settings → Calendar, just hardened in the prior PR) → subjects (pre-seeded, also independently editable) → classes (Admin UI only, nothing pre-seeds these in prod) → staff (create, then a *separate* login-invite step that provisions Supabase Auth + sends a branded invite email) → class↔staff/subject assignment → students/guardians/enrollment → attendance/exams/lesson-plans become meaningfully usable only once classes have assigned staff and enrolled students.
- No empty-state nudging pattern exists to reuse — every list page (`ClassesTable.tsx`, `SubjectsTable.tsx`, etc.) falls through to the shared `DataTable` component's generic "No results found."
- `schools.grading_bands`/`schools.score_weights` are nullable JSONB columns that stay `NULL` in the database until an Admin explicitly saves the Settings → Grading tab at least once — even re-saving the GES-standard defaults unchanged writes real (non-null) values. `GET /school`'s response (`SchoolsService.get_resolved`) always resolves these to GES defaults for *display*, but the raw stored row stays null until a real save.
- `schools.logo_url` is never touched by `seed_reference.py` — confirmed by reading the script. It stays `NULL` until an Admin uploads a real file via the Identity/Branding tab. The `settings.logoUrl ?? "/logo.png"` pattern seen in `AuthBrandPanel.tsx` and elsewhere is a **frontend display fallback only** — nothing writes that placeholder path into the database. This makes `logo_url IS NOT NULL` a reliable, strict signal of "a real logo was uploaded," which is also the signal any future report-card-logo feature would want to check before falling back to a generic placeholder.

## Scope (decided)

- **Form**: a persistent, auto-hiding dashboard widget (Card) at the top of the Admin overview page — not a one-time wizard modal, not a separate `/admin/setup` page.
- **Completion logic**: live data checks only, computed fresh on every load. No stored completion-flag table — nothing to drift out of sync with reality.
- **Dismiss behavior**: no manual dismiss. The widget simply stops rendering once every check passes; before that, it always shows.
- **Five steps**, in dependency order (see below for exact checks). No sixth "lighter per-user checklist" (2FA, notification prefs) in this pass — that's a distinct, smaller feature for a different audience (every role, not just Admin) and is explicitly deferred to a future pass.

## 1. Backend: one endpoint, one service method

New `GET /school/onboarding-status` (any authenticated role may call it, though only the Admin-facing UI renders it) — returns the five steps' done/not-done status in one response, avoiding N separate frontend round-trips and keeping "what counts as done" logic in one place.

Lives in `SchoolsService` (the existing cross-domain orchestrator — same place `prepare_next_year`/`activate_next_year` already live, since these checks span classes, staff, and school_terms, not just the `schools` row) as a new `get_onboarding_status()` method, reusing existing repositories (`ClassesRepository`, `SchoolTermsRepository`) plus one new staff-with-login query.

Response shape: `OnboardingStatusRead` with five boolean fields (`identityDone`, `gradingDone`, `calendarDone`, `classesDone`, `staffDone`) plus a derived `allDone: bool` the frontend can check first to decide whether to render anything at all.

## 2. The five checks

1. **Identity** (`identityDone`) — `schools.logo_url IS NOT NULL`. A real logo file has been uploaded (see audit note above on why this is reliable, not a placeholder artifact).
2. **Grading** (`gradingDone`) — raw stored `schools.grading_bands IS NOT NULL` (checked on the unresolved row, not the always-resolved `GET /school` response). Captures "the Admin visited and saved this tab," without forcing customization away from valid GES defaults.
3. **Academic calendar** (`calendarDone`) — all 3 `school_terms` rows exist for the school's current `academic_year`.
4. **Classes** (`classesDone`) — at least one row in `classes` exists for the school's current `academic_year`.
5. **Staff** (`staffDone`) — at least one `staff` row with `system_role != Admin` has a linked `users` row (i.e., a provisioned login/invite sent), beyond the seeded Admin account itself.

## 3. Frontend: a pure Server Component widget

New `OnboardingChecklist` Server Component, rendered first (above the existing stat cards) on `apps/web/src/app/(dashboard)/admin/page.tsx`. Fetches `GET /school/onboarding-status` via `getApi()`; renders `null` immediately if `allDone`.

Layout: a `Card` with a distinct accent-colored left border (matching the existing `AuthBrandPanel` visual convention) so it reads as a "you're not fully set up" notice rather than an ordinary stat card.
- Header: "Finish setting up your school" + "N of 5 done".
- Five rows, one per step, in the dependency order above (Identity → Grading → Academic Year & Terms → Classes → Staff) — a filled checkmark + muted text for done steps, an outline circle + a "Go to [X]" link for incomplete ones, linking directly to the relevant Settings tab (`?tab=identity`, `?tab=grading`, `?tab=calendar`) or the Classes/Staff list pages.
- No client-side state, no dismiss button, no animation — purely data-driven, matching the "auto-hides on completion" decision.

## Testing

- Backend: pytest coverage for `get_onboarding_status()` — each of the 5 checks independently true/false, and the combined `allDone` flag flipping only once all 5 are true. Reuses the existing `schools` test fixtures (`seed_school`, transactional `db_session`).
- Frontend: manual browser check — confirm the widget renders with the correct partial-progress state against seeded demo data (which already has classes/staff/terms, so most steps should show done), and confirm it disappears entirely once every check is satisfied. No new Vitest component tests, consistent with this codebase's existing convention.

## Out of scope

- Any "create the school itself" flow — this remains a single-tenant, ops-CLI-bootstrap-only concern per the existing `SchoolsRepository.get_first_active` design; revisit only alongside real multi-school onboarding.
- The "lighter per-user checklist" for non-Admin roles (2FA, notification preferences) — a distinct future feature.
- Any change to how classes/staff/terms are actually created — this widget only surfaces links to the existing Admin UI for each step, it doesn't add new creation flows.
- Manual dismiss / "remind me later" — deliberately not built, per the scope decision above.
