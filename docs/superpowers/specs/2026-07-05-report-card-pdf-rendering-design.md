# Report-card PDF rendering — design

**Date:** 2026-07-05
**Phase:** 3.5 — Platform completion & admin polish (first item)
**Status:** Approved, ready for implementation plan

## Context

Report cards today are React-rendered and browser-printed: `apps/web/src/features/exams/components/ReportCard.tsx` is a real, visually-correct A4 template (`#report-card-print-area`), printed via `window.print()`. There is no server-generated PDF file anywhere.

Two pieces of dead scaffolding already exist from Phase 3: `apps/api/app/features/reports/jobs/report_generate.py` (single-student) and `report_batch.py` (class fan-out), both Inngest jobs triggered by events nothing in the frontend fires. Both write a placeholder **text** string to Supabase Storage at a path ending in `.pdf` — neither fetches real report-card data nor renders anything. Their docstrings explicitly flag this as future work.

The migration plan's stated scope for this item is narrow: "render the existing HTML/print-CSS report-card template to real PDF bytes and write those to Supabase Storage instead [of the placeholder]." Batch/bulk printing is tracked separately in `docs/FEATURE-ENHANCEMENTS.md` §5 as a larger, later upgrade and is explicitly **out of scope** here.

## Goals

- A student's (or their parent's) report card can be downloaded as a real PDF, on demand, for one exam.
- The PDF is byte-for-byte derived from the same data the existing JSON report-card endpoint serves, so there is exactly one source of truth for "what does this report card say."
- Repeated downloads of an unchanged report card don't re-render from scratch.
- Deployable on Railway without introducing Nix/Nixpacks config (explicit user preference — Docker is fine, Nix is not).

## Non-goals

- Batch/bulk generation (printing an entire class in one action) — deferred, tracked separately.
- Emailing the PDF to parents — deferred; this design keeps the Storage object in a location a future email feature can reuse without re-rendering.
- Wiring up the existing `report_generate.py`/`report_batch.py` Inngest jobs — left untouched as unfinished scaffolding for the deferred batch story.

## Architecture

### New endpoint

`GET /students/{student_id}/report-card/pdf?examId=...` — added to the existing `students_router` in `apps/api/app/features/exams/router.py`, next to the current `GET /students/{student_id}/report-card` JSON endpoint.

It calls `ReportCardService.get(session, school_id, user, student_id=student_id, exam_id=exam_id)` — the **exact same call** the JSON endpoint makes. This means:
- Identical authorization: Admin can view any exam; Parent only published ones (the `_assert_can_view`/`is_published` gate).
- Identical data assembly: no second implementation of "what counts as this student's report card."

### Content-hash cache

A published exam's report-card data is **not actually immutable** — scores can still be edited after publish (silently accepted, just audit-logged instead of blocked), and class-teacher remarks / head-of-school comments have no publish-state check at all. Only the exam's own metadata (name/term/type) locks on publish. This rules out a naive "cache once published" strategy — there's no reliable signal for "this will never change again."

Instead, the cache invalidates itself automatically by hashing the assembled response, so no call site (scores service, remarks service, comments service) needs to remember to bump a version counter:

**New table `report_card_pdf_cache`** — pure cache, no soft-delete:
```
school_id   uuid  \
exam_id     uuid   } composite primary key
student_id  uuid  /
content_hash   text        not null   -- sha256 of the sorted-keys JSON dump of ReportCardResponse
storage_path   text        not null
generated_at   timestamptz not null
```

Endpoint flow:
1. `data = ReportCardService.get(...)` — live fetch, same as always.
2. `content_hash = sha256(json.dumps(data.model_dump(mode="json"), sort_keys=True))`.
3. Look up the cache row for `(school_id, exam_id, student_id)`.
4. **Hash matches** → nothing changed since the last render. Skip rendering and uploading. Call the existing `storage.get_signed_url("documents", cached_row.storage_path)` and redirect (302) the client there.
5. **Hash differs or no row** → render (see below), upload to the deterministic path (`report_card_storage_path()`, already defined in `report_generate.py`) with `content_type="application/pdf", upsert=True` (overwrites — no duplicate objects at that path, ever), upsert the cache row with the new hash + timestamp, then redirect to the signed URL.

The endpoint's return type is `RedirectResponse` — no `response_model`, unlike every other route in this router.

`report_card_pdf_cache`'s composite primary key `(school_id, exam_id, student_id)` already matches the only access pattern this cache has (point lookup by all three) — no additional index needed. New Alembic migration is hand-written per convention, no autogenerate.

This needs **zero new `StorageClient` methods** — it reuses `upload()` and `get_signed_url()` exactly as they exist today (`apps/api/app/integrations/storage.py`); the "has this changed" check happens entirely in Postgres.

Verified `ReportCardResponse` (`apps/api/app/features/exams/schema.py:301`) has no volatile fields (no embedded timestamps, no non-deterministic ordering) — it's a pure function of DB state, so hashing it is a reliable change-detector.

### Rendering pipeline

1. New Jinja2 template — `apps/api/app/features/exams/templates/report_card.html` — mirroring `ReportCard.tsx`'s layout by hand: header, student info grid, Core/Elective score tables, attendance/remarks/signatures, GES grading-scale legend footer.
2. `weasyprint.HTML(string=rendered_html).write_pdf()` → PDF bytes.
3. Jinja2 is a new dependency (`uv add jinja2`) — no templating engine exists elsewhere in `apps/api` today (email sending uses plain strings). WeasyPrint is also new (`uv add weasyprint`).

### Frontend

`apps/web/src/features/exams/components/ReportCardPage.tsx` (the shared client wrapper used by both the admin and parent report-card routes) gets a "Download PDF" button next to the existing "Print" button:
- Calls a new typed client method (`api.exams.getReportCardPdf(studentId, examId)`, generated once `api.d.ts` picks up the new endpoint).
- `fetch()` follows the 302 redirect by default, so `.blob()` reads the actual PDF bytes from the final Supabase Storage response — no special redirect handling needed client-side.
- Triggers a browser download via a temporary `<a href={URL.createObjectURL(blob)} download>`.
- Loading spinner while in flight; on failure, `toast.error` via the existing `ApiError` catch pattern.

### Error handling

- Render failure (bad data, WeasyPrint exception) → caught, mapped to a `ServiceUnavailableError` (matches the existing `AppError` envelope). Nothing is uploaded or cached on failure.
- Storage upload failure → surfaced as an error; the cache row is only written *after* a successful upload, so a failed upload never leaves a cache entry pointing at a nonexistent object.
- Auth/publish-gate failures → unchanged, raised by `ReportCardService.get()` before any rendering happens.

### Deployment

WeasyPrint needs system libraries for text/font shaping that a bare Python install doesn't have: `libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info` (Debian/Ubuntu package names).

`apps/api` currently has no Dockerfile — Railway builds it via the `railpack` builder (Nixpacks' successor) set in `railway.toml`. Per Railway's own docs, **a service with a `Dockerfile` in its root is built with Docker regardless of the builder configured elsewhere** — no `railway.toml` changes needed, no Nix syntax involved (explicit user preference).

New `apps/api/Dockerfile`:
- Base: an official Python 3.14 image (matching `apps/api/.python-version` and `pyproject.toml`'s `requires-python = ">=3.14"`).
- `apt-get install` the packages listed above.
- Install `uv`, `uv sync --frozen` (same install path as today).
- `CMD` mirrors the existing `startCommand` in `railway.toml`: `uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

## Testing

**Backend** (`apps/api/app/features/exams/tests/`):
- Cache-miss path: renders, uploads, writes cache row, redirects.
- Cache-hit path (identical second request): `upload` is **not** called a second time (assert on the fake storage double); still redirects.
- A score edit between two requests busts the cache (hash changes → `upload` called again).
- Auth/publish-gate tests mirror the existing JSON endpoint's tests (same service call, same fixtures).
- Storage stays a fake/in-memory double, same DI pattern as `SupabaseAdminClient`'s fake in the `users` test suite.

**Frontend**: a Vitest test for the Download button's loading/error states, following existing component-test conventions.

## Open questions

None outstanding — all resolved during brainstorming (scope, render approach, delivery mechanism, caching strategy, and deployment approach were each explicitly decided).
