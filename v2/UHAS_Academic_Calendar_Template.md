# UHAS Basic School SMS — Academic Calendar Template

**Version:** 1.0
**Date:** June 2026
**Prepared by:** Simplifyd Labs Ltd
**Source:** UHAS Basic School — 2025/2026 Academic Year, Term 3 Calendar of Major Activities (Staff), presented by IMT
**Companions:** FRD v2.0, Data Model v2.0

---

## 1. Purpose

This document captures the real structure of the UHAS Basic School academic calendar, taken from the Term 3 2025/2026 staff calendar, and defines how the system should model it. It refines the generic `calendar_events` design in Data Model v2.0 to match how the school actually plans a term.

---

## 2. What the Source Calendar Shows

The school's calendar is a **staff-facing operational planner**, organised by term week, with a completion status per activity. The Term 3 2025/2026 sheet has these columns:

| Column | Meaning |
|---|---|
| S/N | Serial number (row order) |
| WK | Term week number (1–13) |
| DATE | Specific date or date range |
| ACTIVITY | What happens |
| STATUS | Completion tracking (blank until done) |

Key structural facts:

- A term runs **13 weeks**; every activity is pegged to a **week number**.
- The same week spine is shared by Schemes of Work and Schemes of Learning — calendar, schemes, and lesson plans all reference term weeks.
- Activities fall into several **categories** beyond simple "event/holiday".
- Each activity carries a **status** the school updates as the term progresses.

---

## 3. Term 3 2025/2026 — Captured Activities

The full activity list from the source, preserved for seeding and reference.

| WK | Date | Activity | Category |
|---|---|---|---|
| 1 | May 1, 2026 | PSC Executive meeting | Governance |
| 1 | May 4–8, 2026 | B.E.C.E | Assessment (external) |
| 1 | May 5, 2026 | Curriculum Presentation | Academic |
| 1 | May 6, 2026 | Re-opening for all | Term milestone |
| 1 | May 8, 2026 | Opening staff meeting | Staff meeting |
| 2 | May 15, 2026 | CPD 1 | CPD |
| 4 | May 25, 2026 | AU Day | Awareness day |
| 4 | May 27, 2026 | Submission of mid-term items | Submission deadline |
| 4 | May 27–29, 2026 | CAT 1 | Assessment |
| 4 | May 28, 2026 | CPD 2 | CPD |
| 4 | May 29, 2026 | PSC General Meeting | Governance |
| 5 | June 5, 2026 | UBS Got Talent | Event |
| 5 | June 5, 2026 | CPD 3 | CPD |
| 6 | June 12, 2026 | Special Open Day | Event |
| 7 | June 15–17, 2026 | Mid-term test | Assessment |
| 7 | June 18–19, 2026 | Mid-term break | Break |
| 7/8 | June 18–26, 2026 | Reading emphasis week | Academic |
| 8 | June 21, 2026 | 2026 Admissions | Admissions |
| 8 | June 24, 2026 | World Drug Day | Awareness day |
| 9 | June 30, 2026 | Submission of midterm results | Submission deadline |
| 9 | July 1, 2026 | Submission of end of term test items | Submission deadline |
| 9 | July 3, 2026 | CPD 4 | CPD |
| 10 | July 7–10, 2026 | CAT2 | Assessment |
| 11 | July 13–17, 2026 | Revision | Academic |
| 12 | July 20–24, 2026 | End of term exams | Assessment |
| 13 | July 30, 2026 | Vacation | Term milestone |
| 13 | July 31, 2026 | 6th Graduation/Exhibition | Event |

### Key dates other features depend on
- **Re-opening for all:** May 6, 2026
- **Vacation:** July 30, 2026 *(report card "vacation date" — staff request)*
- **Mid-term results submission deadline:** June 30, 2026 *(feeds "who hasn't submitted records" tracking)*
- **End-of-term exams:** July 20–24, 2026
- **CAT1:** May 27–29 · **Mid-term test:** June 15–17 · **CAT2:** July 7–10

---

## 4. Categories Observed

The generic `type` enum (term_start / term_end / exam / holiday / event) is too narrow. The real calendar uses these categories:

| Category | Examples |
|---|---|
| Term milestone | Re-opening, Vacation |
| Assessment | CAT1, CAT2, Mid-term test, End of term exams, BECE |
| Submission deadline | Mid-term items, midterm results, end-of-term test items |
| CPD | CPD 1–4 (staff professional development) |
| Governance | PSC Executive meeting, PSC General Meeting |
| Staff meeting | Opening staff meeting |
| Academic | Curriculum presentation, Reading emphasis week, Revision |
| Event | UBS Got Talent, Special Open Day, Graduation/Exhibition |
| Break | Mid-term break |
| Admissions | 2026 Admissions |
| Awareness day | AU Day, World Drug Day |

> **PSC note:** the calendar confirms PSC (Parent Support Committee) is an active governance body with scheduled meetings — relevant to the earlier open question about whether PSC needs any system surface.

---

## 5. Required Data Model Changes

The `calendar_events` table (Data Model v2.0 §4.6) is revised as follows.

### 5.1 Revised `calendar_events`

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | Tenancy |
| academic_year | varchar | e.g. "2025/2026" |
| term | integer | 1 / 2 / 3 |
| week | integer (nullable) | **NEW** — term week number; shared spine with schemes/lesson plans |
| title | varchar | Activity name |
| description | text | Optional detail |
| start_date | date | |
| end_date | date (nullable) | For ranges (e.g. CAT 1: May 27–29) |
| category | varchar | **NEW (expanded)** — term_milestone \| assessment \| submission_deadline \| cpd \| governance \| staff_meeting \| academic \| event \| break \| admissions \| awareness_day |
| audience | varchar | **NEW** — staff \| parents \| students \| all (this sheet is staff-facing) |
| status | varchar | **NEW** — planned \| in_progress \| done \| cancelled (the source's STATUS column) |
| created_by_id | FK staff | |
| created_at | timestamp | |

### 5.2 Why "week" becomes first-class

Schemes of Work, Schemes of Learning, and the calendar all reference the same term-week numbering. Making `week` explicit on calendar events lets the system:
- Show a teacher their week's plan alongside that week's calendar activities.
- Cross-check submission deadlines (e.g. "midterm results due Week 9") against actual submission status.
- Drive the Head of School compliance view from calendar deadlines rather than hard-coded dates.

### 5.3 Audience scoping

This sheet is the **Staff** calendar. The school likely maintains parent-facing and student-facing variants too. The `audience` column lets one calendar table serve all three, with the parent-facing published view (FRD §3.12) filtering to `audience IN ('parents','all')`.

### 5.4 Status tracking

The STATUS column is operational — staff mark activities done as the term runs. The `status` field supports this, and a future enhancement could auto-set status (e.g. mark "Submission of midterm results" done when all classes have submitted).

---

## 6. Report Card Linkage

Two calendar dates feed the report card directly (a staff request from the requirements doc):

- **Re-opening date** (next term's "Re-opening for all") → printed on the report card.
- **Vacation date** (this term's "Vacation") → printed on the report card.

These should be derived from `calendar_events` (or `school_terms`) rather than typed manually per report, so they stay consistent.

---

## 7. Seeding & Template Reuse

- The Term 3 2025/2026 activities above can be seeded as the first real calendar dataset for the demo.
- The category + week structure forms a **reusable template**: each new term, staff clone the prior year's calendar and adjust dates, rather than re-entering every activity.
- A future enhancement: a "calendar template" feature that pre-populates standard recurring activities (CPD slots, CAT windows, submission deadlines, governance meetings) for a new term.

---

## 8. Open Questions

| # | Question | Impact |
|---|---|---|
| 1 | Are there separate parent-facing and student-facing calendars, or one calendar filtered by audience? | Whether one table serves all or variants are needed |
| 2 | Should submission-deadline activities auto-link to the actual submission tracking (schemes, results)? | Compliance automation |
| 3 | Does PSC need any system surface (view the calendar, receive notices), or is it offline? | Possible PSC read access |
| 4 | Confirm term week count is always 13, or does it vary by term? | Week validation |
| 5 | Should calendar activities trigger notifications/SMS (e.g. reminder before a deadline)? | Notification wiring |

---

*End of Academic Calendar Template.*
