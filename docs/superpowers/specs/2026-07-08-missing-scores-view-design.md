# Class-teacher "missing scores" view — design

**Date:** 2026-07-08
**Phase:** 4 — Close requirement gaps (item 8 of 7-item set)
**Status:** Approved, ready for implementation

## Context

A class teacher assembling a class report for an exam needs to know which subject teachers haven't entered their scores yet. Today there's no completeness surface anywhere — the class-report workflow tracks only remarks + Draft/Submitted status, never inspecting `scores`; the exams UI shows only Published/Draft.

Audit verdict: **pure new read, no schema change.** Every piece already exists:
- `Score` grain is one row per `(exam_id, student_id, subject_id)` (unique constraint `scores_natural_key`); a row exists only once entered, and `total_score IS NULL` / no row = not graded.
- `ClassSubject(class_id, subject_id, teacher_id?)` is the expected subject→teacher set for a class (`teacher_id` nullable → a subject can be unassigned).
- Class-teacher gate: `ClassReportsRepository.is_class_teacher` / `classes_taught_by`, and the view rule `_assert_can_view_class` (class teacher + Admin + DeputyHead-of-division) already used by the class-report detail.
- Current term/year: `schools.current_term` + `schools.academic_year`; the exam carries its own `academic_year` + `term`.
- Reusable reads: `active_students_in_class` roster, `ClassSubjectsRepository.list_for_class`.

## Goal

For a given exam + class, show each subject, its subject teacher, and how many of the class's active students have a graded score — so the class teacher can chase the teachers who haven't entered scores.

## Non-goals

- No schema change, no new table.
- Not a term-wide roll-up across exams (this is per-exam, matching the class-report route). A dashboard summary card is a possible later add — out of scope now.
- Doesn't change score entry, the report workflow, or publishing.
- Doesn't fix the pre-existing "my classes as class teacher" N+1 on the frontend (separate improvement).

## Architecture

### Backend — one read endpoint
`GET /exams/{exam_id}/score-completeness?classId=<uuid>` → `ScoreCompletenessResponse`.

- **Auth/gate:** reuse the class-report visibility rule — the caller must be the **class teacher** of `classId`, or **Admin**, or the **DeputyHead** of the class's division. Reuse `_assert_can_view_class` (or the same repo predicates) so the gate can't drift from the class-report detail.
- **Compute** (`ScoresService.score_completeness` or a small new service fn):
  1. Load the exam (404 if missing/other school); resolve the class's active roster for `exam.academic_year` (`active_students_in_class`).
  2. Expected subjects + teachers = `ClassSubjectsRepository.list_for_class(class_id)` → `(subject_id, subject_name, teacher_id, teacher_name)`.
  3. Graded counts: one grouped query — `SELECT subject_id, COUNT(*) FROM scores WHERE exam_id = :exam AND student_id IN :roster AND total_score IS NOT NULL GROUP BY subject_id`.
  4. Per expected subject: `roster_count`, `entered_count` (from the grouped counts, 0 if absent), `status` = `not_started` (0) / `partial` (0 < n < roster) / `complete` (n == roster, roster > 0). Empty roster → `complete` with 0/0 is misleading, so a class with no active students yields an empty row set / roster_count 0 handled explicitly.
- **Response shape** (camelCase via existing config): `ScoreCompletenessResponse { examId, classId, className, rosterCount, subjects: ScoreCompletenessRow[] }`, `ScoreCompletenessRow { subjectId, subjectName, teacherId?, teacherName?, enteredCount, rosterCount, status }`.

### Frontend — panel on the class-reports detail
`teacher/class-reports/[examId]/[classId]` gains a **"Score entry status"** card: a table of Subject · Teacher (or "Unassigned") · Entered `n/total` · a status badge (Not started / Partial / Complete, coloured). Fetched via a new `api.exams.scoreCompleteness(examId, classId)` client method + a server-component read or a TanStack query. Admin/Deputy review views of the same class-report can show it too (same endpoint, same gate).

## Error handling

- Exam or class not in the caller's school → 404.
- Caller not permitted (not the class teacher / not Admin / wrong-division Deputy) → 403, via the shared gate.
- Standard `ApiError` → toast on the client.

## Testing

Backend integration tests: a class with a mix — one subject fully graded (complete), one partially graded (partial), one with no scores (not_started), and one assigned no teacher (teacherName null) — asserts the per-subject counts + status and the roster count. Gate tests: the class teacher and Admin get 200; a teacher who isn't the class teacher and a Deputy of another division get 403. No frontend component test (repo precedent).

## Open questions

None — placement (class-reports panel), scope (per-exam, not term roll-up), the "graded = total_score IS NOT NULL" definition, and the reuse of the class-report gate were settled during brainstorming.
