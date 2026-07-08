# Report Card Additions — Design

Phase 4, item 6. Three additions to the student report card. A fourth candidate — a **staff-children filter** — was moved to Phase 4 item 5 (guardians + staff-as-guardian), because it is a roster/linkage concern needing a properly-modelled student↔staff link, not a report-card change.

The report card is rendered twice, by two files kept in sync by hand:

- `apps/web/src/features/exams/components/ReportCard.tsx` — browser/print view
- `apps/api/app/features/exams/templates/report_card.html` — WeasyPrint PDF

Any card change touches both.

## 1. Other name — reuse `middle_name` (frontend only)

`middle_name` already exists on the `Student` model, flows through `StudentBase/Create/Update`, and both renderers already merge first + middle + last into the printed name. The only gap: the two student forms don't expose it.

- Add an **"Other Name(s)"** field to:
  - `apps/web/src/features/students/components/StudentRegistrationForm.tsx` (create) — zod schema, input, submit payload
  - `apps/web/src/features/students/components/StudentDetail.tsx` (edit dialog) — `editSchema`, input, update payload
- Optional field. No backend, no migration.

## 2. Vacation + reopening dates — from `school_terms`

The dates already live in `school_terms` (`start_date` / `end_date`, keyed by `school_id` + `academic_year` + `term`). No new storage.

- **Vacation date** = the exam's term `end_date` (match `school_id` + `exam.academic_year` + `exam.term`).
- **Reopening date** = the *next* term's `start_date`:
  - term 1 → same year, term 2
  - term 2 → same year, term 3
  - term 3 → **next academic year, term 1** (`"2025/2026"` → `"2026/2027"`)
- Backend:
  - `ReportCardService.get` looks up the exam's term row and the next term row (via a new repo helper in `report_card_repo.py`).
  - Add nullable `vacation_date: date | None` and `reopening_date: date | None` to `ReportCardResponse` (`apps/api/app/features/exams/schema.py`).
  - If a term row or its date is missing, the field is `null` — the card omits that line, never crashes.
- Renderers: show `VACATION` / `REOPENING` in the student-info block near `DATE`, only when present.

## 3. Full report — component breakdown (mostly rendering)

The component scores (CAT 1, CAT 2, Project, Group, Exam) are already in the `ReportCardScoreRow` payload and the frontend `ReportCardSubjectRow` type — just never rendered. No data or schema change.

- `ReportCard.tsx` gains a `variant: "summary" | "full"` prop:
  - **summary** (default) — today's columns: Subject / Total / Position / Grade / Interpretation
  - **full** — inserts five columns (CAT 1, CAT 2, Project, Group, Exam) before Total
- `ReportCardPage.tsx` gains a toggle ("Show score breakdown"), pure client state (data already present). `window.print()` reflects the current mode.
- PDF (server-rendered):
  - `report_card.html` branches on a `full` boolean to render the extra columns.
  - The PDF endpoint (`GET /students/{id}/report-card/pdf`) and `ReportCardPdfService.get_or_render` accept a `full: bool` query param.
  - **`full` is folded into the sha256 content hash** (not a new cache-table column). One cache row per (school, exam, student) still; switching variant just changes the hash, so the wrong variant is never served — the only cost is a re-render on the (rare) full↔summary switch. This avoids a migration on a pure cache table.
  - "Download PDF" passes the current toggle state.

## Out of scope (explicit)

- Core/Elective bucketing fix and the hardcoded `number_on_roll` / attendance `0` placeholders (these were the *other* "full report" interpretations, not chosen).
- Staff-children marker/filter and staff-as-guardian — Phase 4 item 5.

## Testing

**API**
- Term-date lookup: vacation = exam-term end_date; reopening = next term start_date; the **term-3 → next-academic-year term-1** rollover; missing-term / missing-date → `null` (no crash).
- PDF cache key differs between `full=true` and `full=false` for the same student/exam.

**Web**
- Create + edit forms include and submit the other-name field.
- Full-report toggle switches the rendered columns.
- Lint, `tsc`, Vitest, build, and OpenAPI→TS drift all green.
