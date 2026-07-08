# Scheme comment threads — design

**Date:** 2026-07-08
**Phase:** 4 — Close requirement gaps (item 4)
**Status:** Approved, ready for implementation

## Context

Schemes of learning go `draft → submitted → acknowledged` (acknowledge is terminal — no reject/send-back). Today the review feedback is a single `schemes.reviewer_comment` column that is **overwritten** on each acknowledge, losing reviewer identity and history. Lesson plans solved the analogous problem with an append-only `lesson_plan_reviews` child table — but its API still surfaces only the latest review (a full thread was left as backlog there).

This feature gives schemes a real, visible **two-way comment thread**: the scheme's author (teacher) and the reviewers (Head of School / Deputy Head of the division / Unit-Head teacher of the division) can each leave comments, preserved with attribution and timestamp. Authorization for reviewers already exists (`_assert_can_acknowledge` permits Admin, Deputy own-division, Unit-Head own-division); the only backend gap is letting the author post, and the only frontend gap is a Deputy-facing schemes page (schemes review lives only under `/admin/schemes` today).

## Goal

A production comment thread on each scheme: teacher + reviewers converse; every comment is attributed and time-stamped; nothing is overwritten.

## Data model

New `scheme_comments` table:
- `id` UUID PK (`gen_random_uuid()`)
- `scheme_id` UUID FK → `schemes.id`, not null
- `author_id` UUID FK → `staff.id`, not null (teacher author *or* a reviewer — both are staff)
- `body` Text, not null
- `created_at` DateTime `server_default=clock_timestamp()`, nullable — `clock_timestamp()` (not `now()`) so comments appended within a single transaction still get strictly increasing, deterministically-orderable timestamps
- Index `scheme_comments_scheme_idx` on `(scheme_id, created_at DESC)`

`schemes.reviewed_by_id` + `reviewed_at` are **kept** — they record who *acknowledged* and when (the terminal action), which is distinct from the comment thread. `schemes.reviewer_comment` is **dropped** and its content backfilled into a `scheme_comments` row (authored by the row's `reviewed_by_id`, at `reviewed_at`) so no history is lost.

Migration mirrors `b1bbb27bb731_lesson_plan_reviews_child_table.py`: `create_table` + index, backfill from the old column, then `drop_column("schemes", "reviewer_comment")`. `downgrade` re-adds the column and copies back the latest comment.

## Backend

- **`POST /schemes/{id}/comments`** (body `{ body: str }`) → appends a `scheme_comments` row. Gate: the scheme's **author** (`scheme.teacher_id == actor_staff_id`) **or** a reviewer (Admin / Deputy of the scheme's class division / Unit-Head teacher of that division) — the existing `_assert_can_acknowledge` logic, generalized to `_assert_can_comment` that also admits the author. Allowed while the scheme's status is `submitted` or `acknowledged` (not `draft` — nothing to discuss before submission). No status change.
- **`acknowledge`** — unchanged flow (status `submitted → acknowledged`, stamp `reviewed_by_id`/`reviewed_at`), but its optional comment is now appended to `scheme_comments` (authored by the acknowledger) instead of overwriting a column.
- **`SchemeRead`** gains `comments: list[SchemeCommentRead]` — `{ id, authorId, authorName, body, createdAt }`, ordered oldest→newest — resolved via a join to `staff` for the name. The flattened `reviewer_comment` field is removed from the read; `reviewed_by_id`/`reviewed_by_name`/`reviewed_at` stay (the acknowledgement).
- Repository gains `insert_comment` (append, never overwrite) and `list_comments_for_scheme` (ordered, with author name). The scheme list/get reads eager-load the thread (or the detail read does; the list can omit the thread for brevity and expose a count if useful — the detail read carries the full thread).

## Frontend

- **Comment thread component** — a timeline of `{author, time, body}`, teacher-vs-reviewer visually distinguished (compare `authorId` to the scheme's `teacherId`), plus a comment box + "Add comment" action, wired to a `useAddSchemeComment` mutation → `api.schemes.addComment(id, { body })`, invalidating the scheme query on success.
- **Reviewer surfaces:** the existing `AdminSchemeReview` (admin) and a new **`/deputy-head/schemes`** page (division-scoped, reusing the same review + thread component) with a sidebar nav entry — Deputy can already act at the API, this exposes it.
- **Teacher surface:** the teacher's scheme view gains the thread + comment box so they see reviewer feedback and can reply.

## Error handling

- Not the author and not a permitted reviewer → 403 (shared gate).
- Commenting on a `draft` (or empty body) → 400.
- Standard `ApiError` → toast on the client.

## Testing

Backend:
- Append preserves multiple comments across distinct authors, ordered by `created_at`; nothing overwritten.
- Acknowledge appends its comment to the thread + stamps `reviewed_by/at` + flips status; a second acknowledge on an already-acknowledged scheme is rejected (existing behavior).
- Comment gate: the scheme's author (teacher), the Admin, and the own-division Deputy succeed; a wrong-division Deputy and an unrelated teacher get 403; commenting on a draft → 400.
- Read returns the ordered thread with author names.
- Migration up (create + backfill from a seeded `reviewer_comment`) and down (column restored).

Frontend: no component tests (repo precedent) — manual verification against the seeded data (a teacher and a reviewer each posting, thread renders in order; Deputy page loads division-scoped).

## Open questions

None — the audience (teacher author + Head + Deputy own-division + Unit-Head own-division), the two-way thread, keeping `reviewed_by/at` separate from comments, and the Deputy page were all settled during brainstorming.
