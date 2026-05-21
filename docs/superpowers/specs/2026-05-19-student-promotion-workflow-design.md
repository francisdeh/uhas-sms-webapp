# Student Promotion Workflow — Design Spec

**Date:** 2026-05-19
**Phase:** 5.7 (deferred from MVP build)
**Status:** Approved for implementation planning

---

## 1. Purpose

End-of-year promotion is the only feature from the original spec section 5.7 that was never built. Without it, students cannot be moved from one academic year to the next, and the `enrollments` table — which is designed to carry the per-year promotion history — has no producer beyond the initial student registration.

This spec defines a class-teacher → deputy-head workflow, gated by an Admin-controlled "promotion season", that produces next-year `enrollments` rows from per-student decisions (Promote / Repeat / Withdraw / Graduate).

The work is built on mock data following the existing pattern; the real-DB cutover happens in a separate effort.

---

## 2. Scope

**In scope**
- Admin opens/closes a promotion season per academic year.
- Class teacher submits a per-class promotion list (one decision per student).
- Deputy Head approves or sends back per class within their division.
- On approval, new `enrollments` rows are materialised for next year, and current-year enrollments close.
- Score-based default suggestion (Term-3 End-of-Term, failed 3+ core subjects → suggest Repeat).
- JHS 3 students default to Graduate.
- Admin read-only school-wide overview.

**Out of scope**
- Re-running an approved promotion (use class transfer / deactivate to fix mistakes).
- Auto-creating next-year classes (Admin sets these up first via existing class management).
- Notifications/email (general project deferral, not promotion-specific).
- Bulk export of promotion lists.

---

## 3. Data model

Three new tables. All `schoolId`-scoped.

### 3.1 `promotion_seasons`

One row per (school × academic year) that is the gate for the whole workflow.

```
id                   uuid pk
schoolId             uuid → schools
academicYear         varchar(9)                          -- e.g. "2025/2026"
status               varchar(20) -- 'open' | 'closed'
openedWithOverride   boolean      -- true if opened before Term-3 EndOfTerm published
openedById           varchar → staff
openedAt             timestamp
closedById           varchar → staff
closedAt             timestamp
createdAt            timestamp
updatedAt            timestamp
UNIQUE (schoolId, academicYear)
```

### 3.2 `promotion_submissions`

One row per (class × academic year) tracking the class teacher's submission and Deputy Head review.

```
id                uuid pk
schoolId          uuid → schools
classId           uuid → classes                          -- the FROM class
academicYear      varchar(9)
status            varchar(20) -- 'draft' | 'submitted' | 'approved' | 'sent_back'
submittedById     varchar → staff
submittedAt       timestamp
reviewerComment   text
reviewedById      varchar → staff
reviewedAt        timestamp
createdAt         timestamp
updatedAt         timestamp
UNIQUE (classId, academicYear)
```

### 3.3 `promotion_decisions`

One row per student in a submission.

```
id                  uuid pk
submissionId        uuid → promotion_submissions (cascade delete)
studentId           varchar → students
decision            varchar(20) -- 'promote' | 'repeat' | 'withdraw' | 'graduate'
targetClassId       uuid → classes      -- required when decision='promote'
reason              text                -- required when decision='repeat' | 'withdraw'
suggestedDecision   varchar(20)         -- 'promote' | 'repeat' | 'graduate' | null
suggestedReason     text                -- e.g. "Failed 3 core subjects: Math, English, Science"
failedCoreSubjects  integer
createdAt           timestamp
updatedAt           timestamp
UNIQUE (submissionId, studentId)
```

### 3.4 Enrollment materialisation rules

When the Deputy Head approves a `promotion_submissions` row, one Drizzle transaction processes every `promotion_decisions` row in the submission:

| Decision | Current-year enrollment | New-year enrollment |
|---|---|---|
| `promote` | `status = 'Completed'` | new row, `classId = targetClassId`, `academicYear = next`, `status = 'Active'` |
| `repeat` | `status = 'Completed'` | new row, `classId` resolved by the same auto-pick rule as Promote (same-suffix next-year class at the **same level**, e.g. JHS 1A → JHS 1A; falls back to alphabetically first match if no same-suffix exists), `status = 'Repeating'` |
| `withdraw` | `status = 'Completed'` | none. Also: `students.isActive = false` |
| `graduate` | `status = 'Completed'` | none. `students.isActive` stays `true` (alumni). |

After the transaction commits, one `audit_log` row is written with `action='PROMOTION_APPROVED'`, `targetTable='promotion_submissions'`, `targetId=submission.id`, and a JSON `after` snapshot of the enrollment IDs created.

---

## 4. State machine

```
                       (auto-created on first teacher visit)
                                       │
                                       ▼
                                   ┌────────┐
                                   │ draft  │  ◀── teacher edits decisions freely
                                   └────────┘
                                       │ teacher submits
                                       ▼
                                ┌──────────────┐
                                │  submitted   │  ◀── teacher view: read-only
                                └──────────────┘
                          DH send back │  │ DH approve
                                       ▼  ▼
                              ┌───────────┐    ┌───────────┐
                              │ sent_back │    │ approved  │  (terminal — enrollments materialised)
                              └───────────┘    └───────────┘
                                    │
                                    │ teacher edits → status reset to draft
                                    │ (reviewerComment preserved as a banner)
                                    ▼
                                 (back to draft)
```

**Transition rules**
- Auto-create draft when a class teacher first opens `/teacher/promotions/[classId]` and the season is `open`.
- Submit is rejected unless **every student** in the class has a decision, every `repeat`/`withdraw` decision has a non-empty `reason`, and every `promote` decision has a `targetClassId`.
- `sent_back` is editable by the teacher exactly like `draft`, with the reviewer's comment surfaced as a banner.
- `approved` is terminal. Re-approval or send-back is rejected at the action layer.
- All transitions also check `promotion_seasons.status = 'open'`. If the season is closed, every mutating action returns `{ success: false, error: "Promotion season is closed" }`.

---

## 5. Role-based UI

### 5.1 Admin — `/admin/promotions`

**Header card**
- Title: "Promotion Season YYYY/YYYY" (current academic year from `schools`).
- Status pill: `Closed` / `Open` / `Open (override)`.
- Primary action button toggles based on status:
  - `Closed` → "Open Promotion Season".
  - `Open` / `Open (override)` → "Close Promotion Season".
- Opening flow:
  1. Action checks for a published Term-3 EndOfTerm exam (`exams.term=3, type='EndOfTerm', isPublished=true`) for the current academic year.
  2. If found → opens immediately, `openedWithOverride=false`.
  3. If not found → AlertDialog shows: *"Term 3 End-of-Term exam is not published yet. Without it the system cannot suggest Promote/Repeat — class teachers will see no algorithmic default and must decide every student manually. Open anyway?"* On confirm → opens with `openedWithOverride=true`.
- Closing flow: AlertDialog confirms *"Closing the season pauses all unfinished promotion lists. Approved submissions are unaffected. Reopen any time."*

**Overview grid (below header)**
- One row per class in the school, grouped by division.
- Columns: Class · Class Teacher(s) · Submission status pill · Students count · Decided / Total · "View" link.
- Click a class → read-only Admin view of the submission at `/admin/promotions/[submissionId]` (renders the same decision table as the DH review, no actions).

### 5.2 Class Teacher — `/teacher/promotions`

- Sidebar nav item hidden unless `promotion_seasons.status='open'` for current academic year AND the user is on at least one `class_teachers` row.
- Page lists each class where the user is a class teacher with: Class name · Status pill · Continue/View link.
- If `openedWithOverride=true`: banner *"Promotion is open without Term-3 results. The system can't suggest decisions — you'll need to choose each student manually."*

### 5.3 Class Teacher — `/teacher/promotions/[classId]`

**Pre-flight**
- If the user is not a class teacher on this class → 403.
- If the current class's division has no classes set up for the next academic year → show block: *"Ask Admin to set up the YYYY/YYYY classes first."* Hide the form. Submit/save buttons disabled.

**Form**
- Header: from-class name, current → next academic year, status pill.
- If status = `sent_back`: banner with the reviewer's comment.
- Table, one row per active student in the class (joined via `enrollments` with `status='Active'`):
  - Student name + ID + photo thumbnail.
  - **Suggestion chip** (hidden in override mode): "Suggested: Repeat — failed Maths, English, Science" or "Suggested: Promote".
  - **Failed core subjects** count (hidden in override mode).
  - **Decision** Select: `Promote` / `Repeat` / `Withdraw` (JHS 3 only: `Graduate` / `Repeat`).
  - **Target class** Select: shown only when decision = `Promote`; populated with next-year classes in the same division; auto-defaulted to same-suffix match (JHS 1A → JHS 2A) or first match if no same-suffix exists.
  - **Reason** textarea: shown only when decision = `Repeat` or `Withdraw`.
- Footer:
  - "Save draft" → writes whatever's filled in.
  - "Submit to Deputy Head" → runs full Zod validation; field-level errors via react-hook-form.
- Only the primary class teacher can edit; non-primary class teachers see a read-only view.
  - Fallback: if no class teacher is marked primary, any class teacher can edit. (Matches existing mock data state.)

### 5.4 Deputy Head — `/deputy-head/promotions`

- Sidebar item hidden when `promotion_seasons.status != 'open'`.
- Queue grouped by status: `Pending review` (submitted) on top, then `Approved`, then `Sent back`.
- Each row: class name · division · class teacher · submitted-at · "Review" link.

### 5.5 Deputy Head — `/deputy-head/promotions/[submissionId]`

- 403 if the submission's class division ≠ user's division.
- Read-only render of the teacher's table (same component, props for read-only mode).
- Footer:
  - `Reviewer comment` textarea.
  - **Send back** button: requires non-empty comment; sets status `sent_back`.
  - **Approve** button: opens AlertDialog *"This will create next-year enrollments for every student in this list. The action cannot be undone."* On confirm, runs the materialisation transaction.

---

## 6. Default-suggestion algorithm

```
computePromotionSuggestion(student, currentClass, term3Exam, scoresForExam, coreSubjects)
  → { suggestedDecision, suggestedReason, failedCoreSubjects } | null

1. If term3Exam is null (override mode) → return null.
2. If currentClass.name === 'JHS 3' → return:
     { suggestedDecision: 'graduate', suggestedReason: 'Completed JHS 3', failedCoreSubjects: 0 }
3. failedSubjects = coreSubjects where:
     - score row exists for (term3Exam.id, student.id, subject.id)
     - AND score.totalScore < 40
4. If failedSubjects.length >= 3 → return:
     { suggestedDecision: 'repeat',
       suggestedReason: `Failed ${failedSubjects.length} core subjects: ${failedSubjects.map(s => s.name).join(', ')}`,
       failedCoreSubjects: failedSubjects.length }
5. Else → return:
     { suggestedDecision: 'promote', suggestedReason: '', failedCoreSubjects: failedSubjects.length }
```

**Notes**
- A Core subject with no score row is NOT counted as a failure. The teacher sees only what was scored.
- The function is pure; unit-testable in isolation when Phase 8 testing comes online.
- It is called once per student during the initial draft creation and re-called when the teacher reopens a draft (so newly-published scores reflect in the suggestion column).

---

## 7. Edge cases & validation

| Case | Behaviour |
|---|---|
| Class with no class teacher assigned | Shown in Admin overview with status `Not started`. No submission can be created until a class teacher is assigned via existing class management. |
| Student joined mid-year | Appears in the table by current `enrollments.status='Active'` row. Suggestion uses whatever scores exist; missing scores do not count as failures. |
| Student already `isActive=false` | Excluded from the decision table. |
| Next-year stream missing (e.g. only JHS 2B exists for next year) | Auto-pick falls back to the only matching-level class. If multiple matches and no same-suffix, default to alphabetically first; teacher can override for Promote (Repeat has no override — fix post-approval via class transfer). |
| Concurrent submit | Action verifies status is `draft` or `sent_back` before transitioning. Optimistic check on `updatedAt`. |
| Re-approval / re-send-back | Action verifies status is `submitted`. Otherwise returns an error. |
| Season closed mid-flight | Drafts and submitted lists preserved. Mutating actions return "Promotion season is closed". Reopening restores ability to continue. |
| Late Term-3 exam published after override-open | Suggestions do not retro-fill. To get suggestions, Admin must close and reopen the season. |
| Materialisation failure for one student | Whole approval transaction rolls back. Status remains `submitted`. Action returns an error surfaced via Sonner toast. |

---

## 8. Feature module layout

```
src/features/promotions/
├── components/
│   ├── PromotionSeasonHeader.tsx          # Admin header card with open/close button
│   ├── PromotionOverviewGrid.tsx          # Admin school-wide grid
│   ├── PromotionList.tsx                  # Teacher's class list + DH queue
│   ├── PromotionDecisionTable.tsx         # Shared table (read-only mode supported)
│   ├── DecisionRow.tsx                    # Per-student row with select + reason
│   └── ReviewFooter.tsx                   # DH approve/send-back footer
├── actions/
│   ├── open-season.ts                     # Admin opens (with optional override)
│   ├── close-season.ts                    # Admin closes
│   ├── save-draft.ts                      # Class teacher saves
│   ├── submit-list.ts                     # Class teacher submits (with Zod validation)
│   ├── approve-submission.ts              # DH approves + materialises enrollments
│   └── send-back-submission.ts            # DH sends back with comment
├── queries/
│   ├── get-season.ts                      # Current season for the school
│   ├── get-overview.ts                    # Admin school-wide overview
│   ├── get-teacher-classes.ts             # Class teacher's classes with status
│   ├── get-dh-queue.ts                    # DH's division queue
│   └── get-submission.ts                  # Full submission detail (with decisions + suggestions)
├── lib/
│   ├── suggestion.ts                      # computePromotionSuggestion
│   └── next-class-resolver.ts             # auto-pick same-suffix target class
└── types.ts
```

Mock fixtures live in `src/lib/mock/promotions.ts` (added alongside the existing mock files). All actions and queries short-circuit on `USE_MOCK_DATA !== 'true'` returning safe fallbacks, matching the convention used across other features.

---

## 9. Sidebar / nav wiring

| Role | Path | Visibility |
|---|---|---|
| Admin | `/admin/promotions` | Always visible |
| Class Teacher | `/teacher/promotions` | Only when season is `open` AND user is a class teacher |
| Deputy Head | `/deputy-head/promotions` | Only when season is `open` |
| Parent | — | Not shown |

Nav badges (where applicable):
- Class Teacher: badge count = classes the user class-teaches that are not yet `submitted`/`approved`.
- Deputy Head: badge count = `submitted` submissions in their division.

---

## 10. Open implementation questions (none blocking)

- **Mock data shape for `promotion_seasons`**: default fixture starts with `status='closed'` so the workflow demonstrates the open flow on first interaction.
- **Mock data for `promotion_decisions`**: default fixture seeds one demo class (Primary 5) with pre-computed suggestions to make the UI navigable on first load.
- **Database migration**: ships in the DB cutover phase. This spec lands on mock; schema additions stay queued in `src/db/schema.ts` until then.

---

## 11. Success criteria

1. Admin can open and close a promotion season for the current academic year, with the override path when no Term-3 exam is published.
2. A class teacher whose class has a Term-3 EndOfTerm exam published can open `/teacher/promotions/[classId]`, see a per-student suggestion column, change/confirm decisions, save a draft, and submit to the Deputy Head.
3. The Deputy Head sees only their division's submissions in the queue, can approve or send back with a required comment, and approval materialises next-year enrollments.
4. The Admin overview reflects the per-class status across the school in real time.
5. With `USE_MOCK_DATA=true`, all the above flows operate against `src/lib/mock/promotions.ts` without touching the database. With `USE_MOCK_DATA=false`, actions return safe non-mutating responses (matching the convention used by every other feature) until the DB cutover wires the queries up.
6. `tsc --noEmit` and `npm run lint` pass.
