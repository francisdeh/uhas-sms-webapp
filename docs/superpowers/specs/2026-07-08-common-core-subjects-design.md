# Common Core subjects seed — design

**Date:** 2026-07-08
**Phase:** 4 — Close requirement gaps (item 1 of 7)
**Status:** Approved, ready for implementation

## Context

The requirement is to seed the school's real subject list per the product owner's confirmed answer. Subjects are **division-scoped** rows (`subjects.division`, `subjects.category`) — "English Language" in JHS is a distinct row from "English Language" in Lower Primary. They're seeded in `apps/api/app/scripts/seed/academic.py`'s `_SUBJECTS_BY_DIVISION` dict; the class-subject assignment and JHS subject-teacher rotation both iterate over each division's list, so the seed scales to any list length with no other code change. A grep confirmed **no app code or test hardcodes the current subject names**, so this is fully self-contained.

## Goal

Replace the placeholder per-division subject sets with the product owner's confirmed curriculum.

## The subject lists (confirmed)

- **KG (7):** Numeracy, Literacy, Creative Arts, Our World and Our People, French, Ewe, Computing
- **Lower Primary (9):** English Language, Mathematics, Science, Religious and Moral Education, Computing, Ewe, French, Creative Arts and Design, History
- **Upper Primary (9):** *same as Lower Primary* — the PO gave one "Primary" list; confirmed it applies to both primary divisions.
- **JHS (11):** English Language, Mathematics, Science, Religious and Moral Education, Computing, Ewe, French, Career Technology, Social Studies, Creative Arts and Design, Music

Names are used verbatim (they surface on report cards). All rows `category="Core"` — the PO listed them plainly with no elective distinction; flipping specific ones to "Elective" later is a one-line seed edit.

## Non-goals

- No schema change / migration — `subjects.division` and `subjects.category` already exist.
- No change to the class-subject / teacher-rotation / score-seeding logic — it iterates over the lists and scales automatically.
- Subject **management UI** (admin add/edit subjects) is out of scope for this item; this is seed data only.

## Architecture

Single edit to `_SUBJECTS_BY_DIVISION` in `apps/api/app/scripts/seed/academic.py`. Slugs are still auto-derived (`NAME-DIVISION`, e.g. `ENGLISH-LANGUAGE-JHS`), which stay unique-per-school since the division suffix disambiguates same-named subjects across divisions.

## Testing

Seed is reset-only, so verification is: run `uv run python -m app.scripts.seed`, then confirm the `subjects` table holds the expected per-division sets (correct names, correct division, category Core), and that the seed completes without error (class-subjects + scores populate for the larger sets). The existing backend suite (ruff/mypy/pytest) must stay green — no unit test asserts specific subject names, so nothing should break.

## Open questions

None — division mapping, KG list, Primary-applies-to-both, and Core category were all confirmed by the product owner during brainstorming. (Electives, if any, can be adjusted later per a follow-up from the PO.)
