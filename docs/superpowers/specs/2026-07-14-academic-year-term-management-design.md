# Academic-year / term management deep-dive — design

Backlog item from `v2/UHAS_Migration_Execution_Plan.md` item 11 (no fresh incident driving it — working through the gap-audit backlog). Covers all four gaps surfaced by research, as one cohesive pass: the hardcoded year list blocking real rollover, the missing rollover workflow, cosmetic `current_term`, and a cross-feature date-range bug.

## Pre-design audit — ground truth

- `school_terms` (`apps/api/app/features/school_terms/model.py`) is a real per-`(school_id, academic_year, term)` date-range table with proper audit logging on write — solid, and already the one genuine consumer for report-card vacation/reopening dates.
- Per-domain `academic_year` string columns on classes/enrollments/exams/fees are real scoping keys, not just labels — each domain filters its own rows by year correctly.
- `schools.current_term` is purely cosmetic today: nothing outside display logic reads it, despite `docs/implementation-spec.md`'s original spec calling for a date-based "auto-pick."
- `apps/web/src/lib/academic-year.ts`'s `ACADEMIC_YEARS` constant is a hardcoded 4-entry array (`2022/2023`–`2025/2026`) enforced via `z.enum()` on class creation, exam creation, the year switcher, and fee-item forms. Once the real year advances past `2025/2026`, an Admin cannot create a class or exam for the new year through the UI at all without a code change + deploy — the single most concrete functional blocker found.
- Rolling to a new year today is two disconnected manual steps: Promotions' `approve()` (`apps/api/app/features/promotions/service.py`) transactionally creates next-year `enrollments` rows, but never touches `schools.academic_year`/`current_term`; an Admin must separately hand-edit those fields in Settings → Calendar tab, with no validation that promotions ran, that classes exist for the target year, or that the typed value is even in the hardcoded array.
- Promotions' `submit_list` step (`promotions/service.py`) already requires next-year classes to exist before teachers can submit — meaning "prepare next year" must happen *before* promotions run, not after, and today that preparation is entirely manual (an Admin hand-creates every class for the new year).
- Cross-feature bug: `apps/web/src/app/(dashboard)/parent/page.tsx`'s `academicYearRange()` hardcodes the academic year as Sept 1 – Aug 31 to compute the parent dashboard's attendance percentage, while report cards correctly resolve the real Admin-configured `school_terms` dates for the same purpose — two disagreeing definitions of "the year's date range" in the same codebase.
- `ExamsManager.tsx`'s exam-creation form always defaults a new exam's `term` field to `1`, never reading `schools.current_term`, even though that field exists specifically to represent "what term are we in."

## Scope (decided)

All four gaps in one pass:
1. Replace the hardcoded `ACADEMIC_YEARS` array with a dynamic valid-years list.
2. Build an explicit two-step rollover workflow: "Prepare next year" (before promotions) and "Activate next year" (after promotions close).
3. Make `current_term` auto-computed from `school_terms` dates, with a manual override escape hatch.
4. Fix the parent-dashboard Sept–Aug hardcode and the exam-creation term-default, both of which are downstream of item 3's term-resolver logic.

## 1. Dynamic academic-year source

- No new table — `school_terms` already holds real per-year data.
- Backend: expand the school-terms read path so the frontend can derive "every year we have term data for," rather than being scoped to only the current year. (Exact endpoint shape — extending `GET /school/terms` with an optional year-less "list years" mode vs. a small new endpoint — is an implementation decision for the plan, not the design.)
- Frontend: delete `apps/web/src/lib/academic-year.ts`'s `ACADEMIC_YEARS` constant. Every current `z.enum(ACADEMIC_YEARS)` call site (`ClassCreateForm.tsx`, `ExamsManager.tsx`, the year switcher, fee-item forms) instead validates against: *years present in `school_terms`* ∪ *`next_academic_year(schools.academic_year)`* (reusing the existing `promotions/academic_year.py` helper, ported to a shared location both features can import). This guarantees an Admin can always at least start preparing the next year, even before any `school_terms` rows exist for it.

## 2. Rollover workflow

Two separate, explicit Admin actions on the Settings → Calendar tab, not one combined button — they happen at different points in the year-end cycle.

**Prepare next year** (Admin-only, idempotent — safe to run more than once):
- Copies the current year's `classes` (division + name only) into `next_academic_year(current)`, skipping any that already exist for that year.
- Creates `school_terms` rows for the new year by shifting each current-year term's `start_date`/`end_date` forward exactly one year, skipping any that already exist.
- Returns a summary count (e.g. "6 classes and 3 term periods created for 2026/2027"). Everything created is ordinary, editable/deletable data — this is scaffolding an Admin can adjust before Promotions opens, not a locked commitment.

**Activate next year** (Admin-only, appears once prepared):
- Guarded: refuses unless the current year's promotion season is closed (checked against `promotion_seasons` status). Clear, specific error if blocked (e.g. "Promotion season for 2025/2026 is still open — close it before activating 2026/2027").
- On success: sets `schools.academic_year` to the new year, clears `current_term_override` (letting auto-pick take over fresh for the new year), and writes an audit-log entry — replacing today's unvalidated, unaudited direct `PATCH /school` as the only way to change the active year.

## 3. Term auto-pick with override

- New nullable column `schools.current_term_override: int | None`.
- A shared resolver (one function, called from both the backend response that currently returns `current_term` and anywhere else it's read) computes the *effective* current term as: `override if set, else whichever school_terms row's date range contains today, else the nearest/last known term as a fallback` (so a gap between terms, or a new year with no term dates configured yet, doesn't error — it degrades to a sane default rather than crashing).
- Settings → Calendar tab's term control changes from "set the term" to "Auto — Term 2 (override)" with an explicit override toggle/select, so the common case needs no manual action at all.

## 4. Two bug fixes riding on the term resolver

- **Parent dashboard attendance %**: `parent/page.tsx`'s `academicYearRange()` (hardcoded Sept 1–Aug 31) replaced with a real lookup against `school_terms` — first term's start date to last term's end date for that year — matching what report cards already do correctly.
- **Exam-creation term default**: `ExamsManager.tsx`'s new-exam form defaults `term` to the resolver's effective current term instead of a hardcoded `1`.

## Testing

- Backend: pytest coverage for the year-source list (years-with-terms ∪ next-year), prepare-next-year (idempotency — running twice doesn't duplicate classes/terms), activate-next-year's guard (blocked while promotion season open, succeeds once closed, audit row written), and the term resolver (exact-match, gap-between-terms fallback, override takes precedence).
- Frontend: manual browser check — class/exam creation offers the correct dynamic year list; Prepare/Activate buttons on the Calendar tab; parent dashboard attendance % against real term dates; a new exam's term field pre-fills to the resolved current term.
- No new Vitest component tests planned, consistent with this codebase's existing convention (unit + integration tests are backend-only; frontend relies on `tsc`/lint/manual verification).

## Out of scope

- Promoting academic year to a first-class table with FKs from every domain (classes/enrollments/exams/fees keep their existing per-row string columns) — the dynamic-list approach solves the immediate gap without that larger schema migration.
- Any change to Promotions' own approval/transaction logic — it already correctly creates next-year enrollments; this design only adds the missing "prepare classes before" and "activate after" bookends around it.
- Multi-term-system flexibility (e.g. semesters instead of 3 terms) — the school's 3-term structure is unchanged.
