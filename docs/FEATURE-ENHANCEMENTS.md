# Feature Enhancements — Depth Gaps in Shipped Features

Audit of features that are already in production but shallow against real-world expectations. These aren't missing features (those are in [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md)); these are existing surfaces that hit their floor faster than users expect.

Last reviewed: 2026-05-21.

> Each item has an effort estimate (solo-dev hours) and a "why this matters" — pick by impact, not order.

---

## 1. Leave management — `~30–40 h`

**Current state**: `LeaveRequestForm` + `LeaveRequestList` + `MyLeaveRequests`. Staff submits sick/maternity/personal/other; DH or Admin approves or rejects. Overlap detection catches double-booking.

**Files**: [src/features/attendance/components/Leave*.tsx](src/features/attendance/components/), [actions/index.ts](src/features/attendance/actions/index.ts), `leave_requests` table.

### Depth gaps

- **No leave balance tracking** — no annual / sick / casual quota. The system can't reject "you've used your 21 annual days already". Staff can request unlimited leave.
- **Limited leave types** — `sick | maternity | personal | other`. Missing: annual, paternity, study, compassionate, bereavement, time-in-lieu. The `other` bucket carries too much.
- **No documents** — no sick-note PDF upload. Schools want medical proof for absences >3 days.
- **No substitute teacher workflow** — when a teacher's leave is approved, their classes are silently uncovered. Should suggest / assign substitutes from a pool.
- **Single-stage approval only** — long leaves (>5 days) should escalate to Head of School. Currently any DH can approve any duration.
- **No reporting** — "most leave by staff this term", "total days used by division", "approval turnaround times". Nothing.
- **No calendar integration** — approved leave doesn't auto-block staff days in the school calendar; staff attendance sheet doesn't auto-mark absent on leave days.

### Minimum acceptable upgrade (~15 h, half-fix)

- Add `leave_balances` table (per staff, per type, per year). Default quotas per leave type configurable in Admin Settings.
- Validate balance on submit; show "X days remaining" in the form.
- Add `study | annual | paternity | compassionate` to the type enum + UI.
- Document upload field on the form (Firebase Storage signed URLs, like lesson plans).
- Approved-leave-blocks-staff-attendance integration: `getStaffAttendanceForDate(staffId, date)` checks for an approved leave covering that date.

### Full upgrade (~30–40 h)

Everything above plus:

- Multi-stage approval workflow (>5 days → escalate to HOS).
- Substitute assignment UI (admin or DH picks from available teachers for each affected period).
- Reporting page: leave taken by staff/division/term, approval turnaround.
- Calendar entries auto-created for approved leave; cleared on revoke.

---

## 2. Student profile depth — `~20–30 h`

**Current state**: [StudentDetail.tsx](src/features/students/components/StudentDetail.tsx). Name, photo, DoB, gender, class enrollment, contact, religion/nationality, active flag.

### Depth gaps

- **Sibling linking** — guardians with multiple kids: no UI link between siblings. Admin and parents both notice this.
- **Multiple guardians not surfaced** — `student_guardians` is a many-to-many table; the UI shows only one guardian per student.
- **No academic history view** — no "all terms, all years" tab. Each report card is its own page.
- **Medical info: placeholder** — no allergies, conditions, medications field. Schools want these on hand at minimum.
- **No special-needs flags** — gifted, learning support, IEP. Common ask.
- **No transfer history** — when a student moves classes mid-year, no log. Hidden in audit log if at all.
- **Documents missing** — birth certificate, immunization record, transfer letter, photo. No file storage attached to the student.
- **No achievements / awards.**
- **No behavior log** — depends on building a behavior module first.

### Minimum acceptable upgrade (~12 h)

- Sibling list ("Other children at this school" section).
- All guardians shown (rendering the `student_guardians` join properly).
- Medical info card: allergies, conditions, current medications, emergency contact.
- Documents tab using existing `ImageUploadField` / `FileUploadField`.

### Full upgrade (~25–30 h)

Add to the above:

- Academic history tab: every term's report card, attendance pattern, behavior log.
- Special-needs flags + admin-only IEP notes section.
- Transfer history (read from audit log + dedicated `student_transfers` table).
- Achievements / awards table + entry form.

---

## 3. Staff management depth — `~15–25 h`

**Current state**: [StaffDetail.tsx](src/features/staff/components/StaffDetail.tsx). Name, photo, role, division, isUnitHead, active flag.

### Depth gaps

- **No hire date or contract type** — every staff record looks the same regardless of seniority or tenure.
- **No qualifications field** — degrees, certifications, training. Schools want this on file.
- **No subject expertise** — what subjects this teacher *can* teach, distinct from current assignments.
- **No staff-side class teacher view** — "my classes" is buried in the classes table. Should be on the staff profile.
- **No documents** — CV, certificates, ID copy. Schools want a personnel file.
- **Emergency contact is a placeholder** — not enforced, not surfaced.
- **No performance evaluation history** — annual evaluations are common; nothing in the system.
- **No professional development tracking** — workshops, certifications earned post-hire.

### Minimum acceptable upgrade (~10 h)

- Hire date + contract type fields (full-time / part-time / contract / volunteer).
- Qualifications text area + structured "certifications" list.
- Subject expertise multi-select (cross-references existing `subjects` table).
- Documents tab.
- Emergency contact card.

### Full upgrade (~20–25 h)

Add:

- "My classes this term" section auto-derived from class_teachers.
- Performance evaluation records (annual form per evaluation cycle).
- Professional development entries (workshops, dates, certificates).

---

## 4. Examinations depth — `~15–20 h`

**Current state**: [Exams.ts](src/features/exams/actions/index.ts) computes grade + interpretation + position; publish/unpublish flag; per-subject scores entered via the grid.

### Depth gaps

- **CAT 1 / CAT 2 / Group Work / Project Work weights** — `scoreWeights` is settable in Admin Settings but **verify every component is actually wired through computation**. The existing tests cover end-of-term exam; the other components may use defaults silently.
- **No re-sit or supplementary exam tracking** — second-chance exams exist in reality; no schema support.
- **Score override audit log exists, no per-student view** — admin can see the global audit log filtered by `SCORE_OVERRIDE`, but no "every override on this student's record" surface.
- **No cumulative grade across terms** — each term is independent. Real schools track running averages across the year.
- **No mark sheet PDF export** — per-class per-subject score sheet for the teacher to print after entry. Currently they have to screenshot.
- **No grade distribution visualization** — class average, histogram by grade. Useful for teacher reflection.

### Minimum acceptable upgrade (~8 h)

- Verify and wire all CAT/Group/Project weights into `computeTotalScore`.
- Add per-student score override history view ("All grade overrides for UHAS-2026-0001").
- Mark-sheet PDF export per (exam, subject, class).

### Full upgrade (~15–20 h)

Add:

- `exam_resits` table + workflow for supplementary exams.
- Cumulative grade panel: running average across all term exams in a year.
- Grade distribution chart on the class report.

---

## 5. Report cards depth — `~25–35 h`

**Current state**: per-student per-term print view. Subjects, scores, grades, interpretations, term position, attendance.

### Depth gaps

- **KG variant** — already deferred. KG schools assess differently (no numerical scores; observational rubrics).
- **No conduct / behavior section** — currently empty or absent. Should reflect a behavior log if one existed; right now placeholder.
- **No co-curricular section** — clubs, sports, leadership roles.
- **No personalized comment per teacher per term** — currently either missing or a single school-wide comment.
- **No class-average comparison** — "your child: 72; class average: 65" is high-value parent context.
- **No promotion recommendation banner** on term-3 reports — should auto-fill from the promotion suggestion logic.
- **No batch print** — admin needs to print all 350 report cards at end of term. Currently page-by-page.
- **No email-to-parent flow** — parents log in to see results. Many would prefer a PDF in their inbox the day results are published.

### Minimum acceptable upgrade (~12 h)

- Conduct + co-curricular sections (text fields entered by the class teacher).
- Class-average comparison line per subject.
- Batch print: admin clicks "Print all" → server-rendered PDF zip download.

### Full upgrade (~30–35 h)

Add:

- KG report variant with observational rubrics (4-point: emerging / developing / proficient / advanced).
- Per-teacher per-term personalized comment, optionally AI-drafted (see AI-assisted track in the commercial roadmap).
- Promotion recommendation banner on term-3 reports.
- Email-to-parent flow: when admin publishes results, parents get PDFs in their inbox.

---

## 6. Audit log viewer — `~6–10 h`

**Current state**: filter by action + date range; side-by-side before/after JSON diff with key highlighting.

### Depth gaps

- **No filter by user** — "everything Mawuli did this week" requires manual scroll.
- **No filter by target** — "this student's complete edit history" requires manual scroll.
- **No CSV export** — schools want this for audit-period documentation.
- **No date pre-sets** — today / this week / this month / this term as clickable chips.
- **No timeline view** for a single user or target — chronological visual.
- **No suspicious-activity alerts** — e.g. >10 score overrides by one user in a day.

### Full upgrade (~6–10 h)

- Add `userId` and `targetId` filters with autocomplete.
- Date-range chips.
- CSV export with applied filters.
- Single-user / single-target timeline view (vertical list with date headers).

---

## 7. Calendar — `~15–25 h`

**Current state**: events list view.

### Depth gaps

- **Single view** — no month, week, or day grid. Just a list.
- **No categories** — academic / holidays / staff-only / public should have visual differentiation.
- **No iCal / Google Calendar export** — parents copying dates into their phone is friction.
- **No recurring events** — "every Wednesday assembly" requires N rows.
- **No drag-and-drop scheduling** for admin (single-event create flow only).
- **No reminder notifications** — calendar doesn't trigger notifications via the new notifications module.

### Minimum acceptable upgrade (~10 h)

- Month-grid view (use `react-day-picker` or build with date-fns).
- Category badges with color coding.
- Optional iCal export endpoint.

### Full upgrade (~20–25 h)

Add:

- Week and day views.
- Recurring events.
- Reminder notifications (1 day before, 1 hour before — configurable per event).
- Drag-and-drop in admin view.

---

## 8. Announcements — `~8–12 h`

**Current state**: title, body, audience scope (school-wide / role / division); fans out notifications.

### Depth gaps

- **No scheduled publishing** — "post this on Monday at 8 AM" requires manual click at 8 AM.
- **Plain text body only** — no rich text editor, no formatting.
- **No image attachments.**
- **No pinned / important flag** — announcements scroll off after a few new ones.
- **No read receipts** — admin can't see which parents have actually seen the announcement.
- **No templates** — recurring announcement types ("term resumption", "PTA meeting") re-typed every time.

### Full upgrade (~8–12 h)

- Scheduled publishing (`publishAt` column, scheduled via a cron job or check at notification fan-out time).
- Tiptap or similar lightweight rich-text editor.
- Image attachments via existing Firebase Storage.
- `isPinned` boolean flag — pinned items always at top.
- Read receipts based on notification `readAt`.
- Templates: save-and-reuse pattern.

---

## 9. Notifications — `~6–10 h` (just shipped; small polish gaps)

**Current state**: 9 event types, 60s polling, mark-on-open.

### Depth gaps

- **No category filter inside the dropdown** — academic vs admin vs system mixed together.
- **No "snooze" or "mute"** — user can't say "don't show me lesson plan submissions for a week".
- **No history page** — only the 10 most recent visible; older notifications can't be searched.
- **Per-user notification preferences deferred** — already in Profile-page completion roadmap.

### Full upgrade (~6–10 h, excluding deferred per-user prefs)

- Category tabs in the dropdown (All / Academic / Admin / System).
- Snooze (1 day, 1 week, forever — stored on the notification row).
- `/notifications` full page with search + filters.

---

## 10. Admin settings — `~5–8 h` (just shipped; UX gaps)

**Current state**: 6 tabs (Identity, Calendar, Grading, Communication, Security, Branding). Each writes immediately.

### Depth gaps

- **No dirty-state warning** when navigating away with unsaved changes.
- **No diff preview before save** — changes are committed without "you're about to change X from Y to Z".
- **No rollback / version history** — can't revert to a previous setting state without remembering the values.
- **No tooltips / help text** — fields are mostly unlabeled in terms of what they do.

### Full upgrade (~5–8 h)

- React-hook-form's `isDirty` + `beforeunload` warning.
- Diff modal before save commits.
- Settings version history (use existing audit_log entries — they already exist for settings writes).
- Tooltip component on each field with one-line explanation.

---

## Priority recommendations

If picking 1–2 to tackle alongside the commercial roadmap, choose by **what UHAS itself will hit first**:

1. **Student profile depth (siblings + guardians + medical + docs)** — parents will notice the first time they look at their child's record. Visible win.
2. **Audit log filters** — admins audit early. Cheap win.

If picking 3–4 for a "depth quarter" before the next big new module:

3. **Leave management upgrade** — staff use this monthly. High signal.
4. **Staff management depth** — admin uses it whenever onboarding/offboarding.
5. **Report card polish (conduct + class average + batch print)** — termly visibility spike, parent-facing.

Defer until specifically asked:

- Calendar grid view, announcement scheduling, notification snoozes, settings dirty-state warning. Real but secondary.

---

## Summary table

| Feature | Min upgrade | Full upgrade | Priority signal |
|---|---|---|---|
| Leave management | ~15 h | ~30–40 h | Staff use monthly |
| Student profile depth | ~12 h | ~25–30 h | Parents see first |
| Staff management depth | ~10 h | ~20–25 h | Admin sees often |
| Examinations depth | ~8 h | ~15–20 h | Termly |
| Report cards depth | ~12 h | ~30–35 h | Termly, parent-facing |
| Audit log filters | — | ~6–10 h | Admin cheap win |
| Calendar grid | ~10 h | ~20–25 h | Constant visibility |
| Announcements | — | ~8–12 h | Per-post |
| Notifications polish | — | ~6–10 h | Daily visibility |
| Admin settings UX | — | ~5–8 h | Setup-time |
| **Total** | **~67 h** | **~145–195 h** | |
