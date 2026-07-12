# Report card polish — design

Phase 6 item 5: KG observational variant, conduct/co-curricular section, class-average comparison, batch print, email-to-parent on publish. Shipped as one combined PR (explicit scope decision — none of the five share meaningful code beyond the report-card assembly path, but a single design + review pass was preferred over five slices).

## Pre-design audit — ground truth

A code audit (not the backlog text) found:

1. **KG observational variant** — 0% built. `ReportCardService.get` pulls numeric CAT1/CAT2/exam/grade rows unconditionally for every division; no branch anywhere checks `division == KG`.
2. **Conduct/co-curricular** — partially built. Free-text `class_teacher_remark` (per-student) and `head_of_school_comment` (per-class) already exist on `StudentReportRemark`/`ClassReportSubmission` and render on both the PDF and `ReportCard.tsx`. No structured conduct-trait or co-curricular field exists.
3. **Class-average** — 0% on the report card. `subject_position` (class rank) is already computed and shown, but no class-average score is joined in. A *different*, unrelated `ClassStats.subject_averages` (teacher-dashboard feature) computes the same shape of number but isn't wired to the report card.
4. **Batch print** — 0% built. Only `GET /students/{id}/report-card/pdf` (single student) exists, backed by a real WeasyPrint+Jinja2 renderer with content-hash caching. A dormant, unused Inngest job pair (`reports/jobs/report_generate.py`, `report_batch.py`) only writes placeholder text files and is triggered by nothing but tests — a drift bug if resurrected as-is.
5. **Email-to-parent on publish** — 0% built. `ExamsService.set_published` only flips a flag + writes an audit log, no event emission. `RESULTS_PUBLISHED`/`on_results_published` is a dead, unreferenced constant/setting.

## 1. KG observational variant

- `student_report_remarks` (existing table, one row per exam+student, edited by the class teacher — already holds `class_teacher_remark`) gains `kg_observations: JSONB | null`: `{domain: rating}` for 5 fixed domains.
- Domains (`Final` constants, `exams/constants.py`): `language`, `numeracy`, `social_skills`, `physical_motor`, `creative_arts`.
- Rating scale (shared with conduct traits below, `Final` constants): `Excellent`, `Good`, `Needs Improvement`.
- `ReportCardService.get`: when `cls.division == KG`, skip `ReportCardRepository.list_scored_rows` entirely — no CAT/exam/grade table for KG students. Populate a new `kg_observations: dict[str, str] | None` field on `ReportCardResponse` instead. `scores: list[...]` stays empty for KG.
- Template (`report_card.html`) and `ReportCard.tsx` render a checklist table (domain → rating) in place of the numeric score grid when `kg_observations` is present.
- Teacher-facing entry: wherever `class_teacher_remark` is currently submitted, KG classes get an additional 5-domain rating section in the same form/payload — no new entry surface, extends the existing one.

## 2. Conduct / co-curricular

- Same table, two more columns: `student_report_remarks.conduct_ratings: JSONB | null` (`{trait: rating}`) and `interests_co_curricular: Text | null`.
- Traits (`Final` constants): `punctuality`, `neatness`, `honesty`, `relationship_with_others`. Same 3-band rating scale as KG observations.
- Applies to every division (not just KG) — rendered as a new section on the PDF template and `ReportCard.tsx`, below the existing remarks.
- `ReportCardResponse` gains `conduct_ratings: dict[str, str] | None` and `interests_co_curricular: str | None`, sourced from the same `StudentReportRemark` row already being read for `class_teacher_remark`.

## 3. Class-average comparison

- `ReportCardRepository` gains a query computing `AVG(total_score)` per subject across the student's class for that exam (same shape as `ClassStats.subject_averages`, narrowed to one class+exam instead of school-wide).
- `ReportCardScoreRow` gains `class_average: float | None`.
- Rendered as a secondary line next to each subject's score (e.g. `78 (class avg: 65)`) in both the PDF template and `ReportCard.tsx`.
- KG rows never populate `class_average` (no numeric scores to average).

## 4. Batch print

- New table `report_card_batch_jobs`: `id`, `school_id`, `exam_id`, `class_id`, `requested_by_staff_id`, `status` (`pending`/`complete`/`failed`), `storage_path: str | null`, `error_message: str | null`, `created_at`, `updated_at`. Needed because the render is async (can't return a signed URL synchronously) and a signed URL can't be embedded permanently in a notification (it expires) — the tracking row lets a later request mint a fresh one.
- New endpoint `POST /exams/{examId}/classes/{classId}/report-cards/batch` (Admin-only): creates a `pending` `report_card_batch_jobs` row, emits `reports/report-card.batch.requested` with `{schoolId, examId, classId, jobId}`.
- New endpoint `GET /exams/{examId}/classes/{classId}/report-cards/batch` (Admin-only): returns the latest job's status, and a freshly-minted signed URL if `complete`.
- `reports/jobs/report_batch.py` is rewired (not left as-is): for each student in the class, calls the real `ReportCardPdfService.get_or_render` (same per-(school,exam,student) content-hash cache as single-student downloads — a re-run after a score edit only re-renders changed students), zips the resulting PDFs, uploads the zip to Supabase Storage, updates the job row to `complete` + `storage_path` (or `failed` + `error_message` on exception), and notifies the requesting admin in-app with a link to the `GET` endpoint above.
- Admin UI: a "Print class" action on the existing class/exam report-cards surface, polling or refresh-driven status, matching the existing `router.refresh()`-after-mutation pattern used elsewhere in this codebase rather than a new polling mechanism.

## 5. Email-to-parent on publish

- `ExamsService.set_published(publish=True)` gains a best-effort `inngest_client.send(...)` emitting `email/results-published.requested` with `{schoolId, examId}`, wrapped in try/except (Sentry-reported, never blocks the publish request) — same shape as the lesson-plan-rejection emit.
- Gated at the emit site (not inside the job) by `school.notification_defaults.on_results_published` — one query, mirrors the lesson-plan-rejection precedent exactly. (This existing setting/constant is currently dead; this is what finally wires it.)
- New job (`exams/jobs/results_published_email.py` or similar): queries every student in the school with either `Score` rows or `kg_observations` for that exam, resolves each student's **primary guardian only** (matches the existing fee-reminder-SMS precedent of one primary contact per family, not fan-out to every guardian — avoids duplicate/conflicting emails), and groups students by guardian.
- Per guardian (with an email on file and `user_preferences.email_on_results_published` not opted out): one email listing all of that guardian's newly-published children for this exam (not one email per child).
- Per child (regardless of guardian's email presence): one in-app notification via `NotificationsService.notify_user`, using the now-wired `RESULTS_PUBLISHED` kind, linking to that child's report card.
- New `user_preferences.email_on_results_published: bool` column, default `true`, same per-user-opt-out pattern as `email_on_lesson_plan_rejected`.

## Migration

Single hand-written Alembic migration:
- `student_report_remarks`: + `kg_observations JSONB NULL`, + `conduct_ratings JSONB NULL`, + `interests_co_curricular TEXT NULL`.
- `user_preferences`: + `email_on_results_published BOOLEAN NOT NULL DEFAULT true`.
- New table `report_card_batch_jobs` (see §4), with an index on `(school_id, exam_id, class_id)` for the status-lookup query.

## Out of scope

- Editing conduct ratings / KG observations for exams that are already published (no lock is introduced — matches the existing precedent that scores/remarks/HOS-comments are all still editable post-publish, audit-logged not blocked).
- Retroactively backfilling `RESULTS_PUBLISHED` notifications or batch-print zips for already-published exams — both are forward-only, triggered by new actions.
- Per-guardian (non-primary) email delivery — explicitly deferred; only the primary guardian is emailed, matching the SMS-reminder precedent.
- Configurable conduct traits / KG domains / rating scale — fixed lists for now, same "no speculative abstraction" call as everywhere else in this codebase; revisit only if a school actually asks to customize them.

## Testing

- Backend: full coverage for the new KG-branch/non-KG-branch split in `ReportCardService.get`, conduct/interests round-trip, class-average computation (including a class with only one scored student — average equals that student's own score), batch-job lifecycle (pending → complete / failed), the `email/results-published.requested` emit gating (school setting off → no emit; on → emit), and the job's primary-guardian grouping + per-user opt-out.
- Frontend: no new Vitest coverage planned, consistent with this codebase's existing convention (Vitest covers pure-logic utilities only — `exams/utils.test.ts`, `promotions/lib/*.test.ts` — not component rendering; there are zero component tests anywhere in the codebase today).
