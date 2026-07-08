# Dev-vs-prod seed strategy — reference seed — design

**Date:** 2026-07-08
**Phase:** 4 follow-up (surfaced by the Common Core subjects work)
**Status:** Approved, ready for implementation

## Context

Today one business-data seed (`apps/api/app/scripts/seed/`, run via `python -m app.scripts.seed`) is **reset-only**: `reset_all` TRUNCATEs every business table, then six groups (identity → academic → assessment → attendance → workflow → comms) repopulate a full demo dataset, all in one transaction. It hard-`SystemExit`s when `ENV=production`.

The problem: a fresh production DB is schema-only (the Alembic baseline inserts no rows), and the **school row has no create UI** (it's the single-tenant anchor) — so *something* must seed it. But you can't run the demo seed against prod (it truncates + injects fakes). Reference data (the school row + config, the subject list) is currently created *inside* the demo groups (`seed_identity` builds the school; `seed_academic` builds subjects), interwoven with demo rows.

Correction captured during brainstorming: admins **can** already create subjects (`/admin/subjects`), classes (`/admin/classes/new`), and set the academic year + term dates (Settings → Calendar) via the UI. So only the **school row** genuinely needs a seed; subjects are a bulk-bootstrap **convenience** (36 rows are tedious to hand-enter). Classes and terms are left to the existing UI.

## Goal

A production bootstrap that idempotently ensures the **school row + config** and the **subject curriculum** exist, without truncating or touching any existing data — safe to run on prod and safe to re-run.

## Scope

**In the reference seed:** the `schools` row + its config (grading bands/weights, pass mark, notification defaults, academic year, current term, identity fields) and `subjects` (per-division curriculum).

**Not in it (per decision):** classes and school_terms (year-scoped, created via the Admin UI); all demo data (staff, guardians, users, students, scores, attendance, workflow, comms).

## Non-goals

- No change to what the demo seed produces — it must yield the identical dataset after the refactor.
- No new DB migration / unique constraint (classes aren't in the reference seed, so their missing constraint is irrelevant here; noted as optional future hardening).
- The Supabase Auth test-account seed stays dev-only (prod staff self-register / are invited via Admin UI).

## Architecture

New module **`apps/api/app/scripts/seed/reference.py`** — the single source of the reference *data* and the *logic*:

- Constants moved here (from `identity.py` / `academic.py`): `ACADEMIC_YEAR`, `SCHOOL_ID` (`det("school-uhas-001")`), `SCHOOL_SLUG`, the school config values, and `SUBJECTS_BY_DIVISION`.
- `ensure_school(session) -> UUID` — look up `schools` by `slug`; if absent, insert with `SCHOOL_ID` + config and flush; return the id (existing or new). **Never modifies an existing school row.**
- `ensure_subjects(session, school_id) -> dict[str, UUID]` — for each `(division, name)`, derive the slug and look up by the `(school_id, slug)` unique key; insert if absent; return `{f"{division}:{name}": id}` (the shape `academic.py` already consumes).
- `seed_reference(session) -> ReferenceResult(school_id, subject_ids)` composing the two.

**Idempotency** is app-level insert-if-absent on the existing natural keys — `schools.slug` (unique global) and `subjects (school_id, slug)` (unique constraint). No DB upsert, no migration.

**Dev seed delegates:** `seed_identity` calls `ensure_school` (drops its inline `School(...)`); `seed_academic` calls `ensure_subjects` (drops its subject loop). Both keep everything else (terms, classes, people, demo data) unchanged. Because both entry points create the reference rows through the *same* functions, the definitions can't drift. To avoid an import cycle, the shared constants live in `reference.py`; `identity.py` and `academic.py` import from it.

**Prod entry point** `apps/api/app/scripts/seed_reference.py`, run via `python -m app.scripts.seed_reference`: opens a `SessionLocal`, calls `seed_reference`, commits. **No `reset_all`, no demo groups, and no production guard** — this is the one meant to run on prod. Prints a short summary (school ensured, N subjects ensured).

## Error handling

- Single transaction; any failure rolls back (nothing committed).
- Re-run against an already-seeded DB (dev or prod): every `ensure_*` finds existing rows and no-ops — no duplicate-key errors, no modifications.

## Testing

Backend integration test (own suite, distinct UUID range / the reference `SCHOOL_SLUG`):
- `seed_reference` on an empty DB → one school row + the full subject set (36 for the confirmed curriculum).
- Run it **again** → row counts unchanged (insert-if-absent), and a config field edited between runs (e.g. `pass_mark`) is **not** overwritten (proves "never modify existing").
- `ensure_subjects` a second time returns the same ids without inserting.

Manual: re-run the **demo** seed and confirm identical output (same 36 subjects / 11 classes / 112 students counts) — proves the delegation refactor didn't change the demo dataset. Then run `seed_reference` against the full-demo DB → clean no-op.

## Docs

`docs/DEPLOY.md` — replace the "no seed runs against prod" stance: after migrations, run `python -m app.scripts.seed_reference` once to bootstrap the school + curriculum; classes + terms are set via the Admin UI; the demo seed remains dev-only.

## Open questions

None — scope (school + config + subjects), semantics (insert-if-absent, never overwrite), and structure (shared `reference.py`, dev delegates, separate prod entry point) were settled during brainstorming. Follow-ups recorded in the roadmap (Phase 6): a first-login onboarding checklist and a bulk academic-year rollover.
