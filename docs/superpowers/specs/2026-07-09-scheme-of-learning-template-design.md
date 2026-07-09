# Full Scheme of Learning Template — Design

Phase 4 item 2: "Build the full Scheme of Learning template (dedicated table, 17 fields) with upload alternative." The "17 fields" framing came from an aspirational FRD spec; the real template (confirmed with the product owner, Mawuli, and the actual sample document the school uses) is simpler. This doc reflects the confirmed, real design.

## Problem, as clarified with the product owner

Naming/cadence, confirmed directly by Mawuli:
- **Lesson Note (old) = Lesson Plan (new) — weekly.** Unrelated to this feature; `lesson_plans` stays untouched.
- **Course Outline (old) = Scheme of Work (new) — termly**, spanning however many weeks the term has.

The actual sample template ("Termly Scheme of Learning") Mawuli sent is a termly document with **one row per week**, and the table has only **6 columns**: `WEEK | STRAND | SUB-STRAND | CONTENT STANDARD | INDICATORS | RESOURCES`. None of the FRD's extra fields (Day/Time, Phase 1/2/3, Assessment, Homework, Cross-curriculum, Misconceptions, Remarks, Keywords, Core Competencies) appear in the real document — that list was speculative, not what the school uses.

A companion document (a GES subject curriculum, e.g. "Computing Curriculum BS7–BS9") is the **source material** a teacher pulls Strand/Sub-strand/Content Standard/Indicator text from when filling a week's row — it's reference context, not a second thing to build.

## Decisions

- **Extend `schemes`** (type="learning"), not `lesson_plans` — confirmed with the product owner. Keeps the two domains distinct, as the codebase already organizes them.
- **One row per week**, matching the real template and the FRD's own "clone last week's plan" UX note. A child table, mirroring the `scheme_comments` pattern already in this codebase.
- **The real 6-column field set**, not the FRD's 17. `week`, `strand`, `sub_strand`, `content_standard`, `indicators`, `resources`.
- **Strand/Sub-strand/Content Standard/Indicators stay free text** for now. A curriculum-seeded dropdown picker is the acknowledged future direction once the full GES curriculum is available for every subject — but that's a separate, much larger project (seeding a curriculum reference table per subject) and explicitly deferred. Plain text columns today don't block that migration later.
- **Resources supports multiple file attachments**, not just text. Some teachers attach images/video/audio of teaching resources. A list of uploaded file URLs (Postgres array column), not a full child table — there's no per-file metadata to justify one, and the existing upload component/storage/signed-URL pattern (already used for the whole scheme's `file_url` alternative) is reused as-is per file.

## Data model

New child table `scheme_weekly_entries`:
- `id` UUID PK
- `scheme_id` FK → `schemes.id`, not null
- `week` Integer, not null — matches `lesson_plans`' existing week-number convention (not a date; the real template just labels rows "WEEK")
- `strand` Text, nullable
- `sub_strand` Text, nullable
- `content_standard` Text, nullable
- `indicators` Text, nullable
- `resources` Text, nullable — free-text description
- `resource_file_urls` — Postgres array of strings, nullable/default empty — zero or more attached files (photo/video/audio/document), each a storage path resolved the same way the scheme's own `file_url` is
- `created_at`, `updated_at`

Only `week` is required, so a teacher can save a partially-filled week and return to it later. Unique `(scheme_id, week)` — no duplicate weeks under one scheme. Migration off the current Alembic head, `create_table` + unique index, mirroring `scheme_comments`' migration shape. No backfill (net-new feature).

## Workflow — unchanged from the existing scheme flow

The scheme keeps its existing `draft → submitted → acknowledged` flow, comment thread, and reviewer gate exactly as today — no new review chain. Weekly entries can be added/edited/deleted only while the parent scheme is `draft` and the caller is the owning teacher; they lock along with everything else once `acknowledged`. At **submit** time, a `type="learning"` scheme requires either ≥1 weekly entry or a `file_url` (the same structured-or-upload choice `type="work"` already has via `content`-or-`file_url`). `type="work"` is completely untouched.

## API

Entries are embedded in `SchemeRead.entries: list[SchemeWeeklyEntryRead]`, the same pattern as `comments` — no separate read endpoint. Three new mutation endpoints, all teacher-owner + draft-only + `type="learning"`-only gated, each returning the refreshed `SchemeRead`:
- `POST /schemes/{id}/entries` — add a week (409 on duplicate `week`)
- `PATCH /schemes/{id}/entries/{entryId}` — edit
- `DELETE /schemes/{id}/entries/{entryId}` — remove

File attachments for `resources` go through the existing upload flow (client uploads to storage, gets back a path/URL, includes it in the entry payload's `resource_file_urls` list) — no new upload endpoint, reusing the existing `kind`-based storage routing (a new `kind` value for scheme-resource files).

## Frontend

`SchemeForm.tsx` branches on `type`: `"work"` is untouched (today's textarea + upload tabs). `"learning"` replaces the textarea tab with a **weekly entries** list (cards sorted by `week`, add/edit/delete), keeping the whole-document upload tab as the alternative. Each entry's form: Week (number), Strand, Sub-strand, Content Standard, Indicators (all plain text inputs), and a Resources section combining a free-text description with a multi-file upload widget (add/remove files, each reusing the existing upload component). A **"Clone last week"** button pre-fills a new entry from the most recent one (frontend-only convenience — consecutive weeks often continue the same strand). Read views (`AdminSchemeReview`, teacher's own view) render entries as cards for `type="learning"`, keeping today's content/file rendering for `type="work"`.

## Testing

Entry CRUD gates (teacher-owner, draft-only, type=learning-only); duplicate `week` → 409; submit validation (learning requires entries-or-file); multi-file resources round-trip correctly; entries embedded correctly in `SchemeRead`; full regression that `type="work"` behavior is untouched.

## Out of scope (explicit)

- A curriculum reference/picker for Strand/Sub-strand/Content Standard/Indicators — future project, once the full GES curriculum is available per subject.
- Any change to `lesson_plans`.
- The FRD's extra 17-field content (Phase 1/2/3, Assessment, Homework, Cross-curriculum, Misconceptions, Remarks, Keywords, Core Competencies) — confirmed not part of the real workflow.
