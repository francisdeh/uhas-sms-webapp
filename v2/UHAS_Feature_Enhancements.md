# UHAS Basic School SMS — Feature Enhancement Recommendations

**Version:** 1.0
**Date:** June 2026
**Prepared by:** Simplifyd Labs Ltd
**Companions:** FRD v2.0, Feature Status Register, Data Model v2.0

---

## 1. Purpose

This document takes the features that already exist but are shallow, plus the new requirements, and lays out the **"minimum acceptable" vs "full" upgrade path** for each — with rationale and effort. It is the depth-and-quality companion to the Feature Status Register (which says *what state* each feature is in); this says *how far to take each one and why*.

Effort figures are indicative solo-developer hours and exclude the FastAPI/Supabase migration itself.

**How to use it:** pick by impact, not order. The "Priority signal" column tells you who notices and how often.

---

## 2. Priority Summary

| Feature | Min upgrade | Full upgrade | Priority signal |
|---|---|---|---|
| Student profile depth | ~12 h | ~25–30 h | Parents see first |
| Audit log filters | — | ~6–10 h | Admin cheap win |
| Leave management | ~15 h | ~30–40 h | Staff use monthly |
| Staff profile depth | ~10 h | ~20–25 h | Admin sees often |
| Examinations depth | ~8 h | ~15–20 h | Termly |
| Report cards depth | ~12 h | ~30–35 h | Termly, parent-facing |
| Calendar grid | ~10 h | ~20–25 h | Constant visibility |
| Announcements | — | ~8–12 h | Per-post |
| Notifications polish | — | ~6–10 h | Daily visibility |
| Admin settings UX | — | ~5–8 h | Setup-time |

**Recommended first cut** (highest pain → lowest): student profile depth, audit log filters, leave management, then report card polish ahead of an end-of-term.

---

## 3. Student Profile Depth — *~12 h min / ~25–30 h full*

**Why:** parents look at their child's record first; gaps here are the most visible.

**Current:** name, photo, DoB, gender, class enrolment, contact, religion/nationality, active flag.

**Gaps:** sibling linking absent; multiple guardians not surfaced (the M2M table shows only one); no academic-history view; medical info is a placeholder; no special-needs flags; no transfer history; no documents (birth cert, immunisation, transfer letter); no achievements.

**Minimum upgrade (~12 h):**
- Sibling list ("other children at this school").
- Render **all** guardians (the `student_guardians` join) — ties into the max-two-guardian requirement.
- Medical card: allergies, conditions, medications, emergency contact.
- Documents tab using the existing upload component.

**Full upgrade (+):** academic-history tab (every term's report, attendance pattern), special-needs flags + admin-only notes, transfer history (`student_transfers` table), achievements/awards.

---

## 4. Audit Log Filters — *~6–10 h*

**Why:** admins audit early; this is a cheap, high-trust win.

**Current:** filter by action + date range; before/after JSON diff.

**Gaps:** no filter by user, no filter by target, no CSV export, no date presets, no single-subject timeline.

**Full upgrade (~6–10 h):**
- `userId` and `targetId` filters with autocomplete.
- Date-range chips (today / this week / this month / this term).
- CSV export with applied filters.
- Single-user / single-target timeline view.

---

## 5. Leave Management — *~15 h min / ~30–40 h full*

**Why:** staff use it monthly; the school explicitly cares about maternity/paternity/sick leave on the Head's dashboard.

**Current:** submit (sick/maternity/personal/other), DH/Admin approve/reject, overlap detection.

**Gaps:** no balance/quota; limited types; no document upload (sick notes); no substitute-teacher workflow; single-stage approval regardless of duration; no reporting; no calendar integration.

**Minimum upgrade (~15 h):**
- `leave_balances` table (per staff, per type, per year); quotas configurable in settings; validate on submit ("X days remaining").
- Add `study | annual | paternity | compassionate` types.
- Document upload on the form.
- Approved leave auto-marks staff attendance on covered days (Inngest job already planned).

**Full upgrade (+):** multi-stage approval (>5 days escalates to Head), substitute assignment UI, leave reporting (by staff/division/term, turnaround), calendar entries for approved leave.

---

## 6. Staff Profile Depth — *~10 h min / ~20–25 h full*

**Why:** admin touches it at every onboarding/offboarding.

**Current:** name, photo, role, division, Unit Head flag, active.

**Gaps:** no hire date/contract type; no qualifications; no subject expertise (distinct from current assignment); no "my classes" on the profile; no documents (CV, certificates, ID); emergency contact placeholder; no evaluation or PD history.

**Minimum upgrade (~10 h):** hire date + contract type; qualifications + certifications; subject-expertise multi-select; documents tab; emergency-contact card.

**Full upgrade (+):** auto-derived "my classes this term"; performance-evaluation records; professional-development entries.

---

## 7. Examinations Depth — *~8 h min / ~15–20 h full*

**Why:** termly, and the score components are a stated requirement (CAT1, CAT2, Group, Project, Midterm, EoT).

**Current:** grade + interpretation + position computation; publish/unpublish; per-subject grid entry.

**Gaps:** **verify every score component is wired through computation, not silently defaulted** (the key migration check); no resit/supplementary tracking; no per-student override history; no cumulative grade across terms; no mark-sheet PDF; no grade-distribution view.

**Minimum upgrade (~8 h):** verify + wire all CAT/Group/Project weights into the total; per-student override-history view; mark-sheet PDF per (exam, subject, class).

**Full upgrade (+):** `exam_resits` table + workflow; cumulative running average across the year; grade-distribution chart on the class report.

---

## 8. Report Cards Depth — *~12 h min / ~30–35 h full*

**Why:** termly visibility spike; parent-facing; several explicit staff requests.

**Current:** per-student per-term print — subjects, scores, grades, interpretations, term position, attendance.

**Gaps:** no KG variant; no conduct/co-curricular; no per-teacher personalised comment; no class-average comparison; no promotion-recommendation banner on term-3; **no batch print**; **no email-to-parent**. Plus the staff requests: vacation/reopening dates, full-report option, staff-children filter, other-name.

**Minimum upgrade (~12 h):** conduct + co-curricular sections; class-average comparison line per subject; **batch print** ("print all" → server-rendered PDF bundle); the four staff-request additions.

**Full upgrade (+):** **KG observational variant** (4-point rubric: emerging/developing/proficient/advanced); per-teacher per-term comment (optionally AI-drafted later); promotion-recommendation banner on term-3; **email-to-parent** when results publish (Inngest job already planned).

---

## 9. Calendar — *~10 h min / ~20–25 h full*

**Why:** constantly visible; the school wants a parent-facing published calendar.

**Current:** events list view.

**Gaps:** no month/week/day grid; no categories; no iCal export; no recurring events; no reminders.

**Minimum upgrade (~10 h):** month-grid view; category badges with colour; parent-facing published view; optional iCal export.

**Full upgrade (+):** week/day views; recurring events; reminder notifications (configurable lead time); drag-and-drop admin scheduling.

---

## 10. Announcements — *~8–12 h*

**Current:** title, body, audience scope; notification fan-out.

**Gaps:** no scheduled publishing; plain text only; no image attachments; no pinned flag; no read receipts; no templates.

**Full upgrade (~8–12 h):** scheduled publishing (`publishAt` + job); lightweight rich-text editor; image attachments; `isPinned`; read receipts from notification `readAt`; save-and-reuse templates. SMS-to-parent for announcements ties into the Hubtel work.

---

## 11. Notifications Polish — *~6–10 h*

**Current:** 9 event types, polling, mark-on-open.

**Gaps:** no category filter; no snooze/mute; no history page; per-user prefs deferred.

**Full upgrade (~6–10 h):** category tabs (All/Academic/Admin/System); snooze (1 day/1 week/forever); `/notifications` page with search + filters.

---

## 12. Admin Settings UX — *~5–8 h*

**Current:** 6 tabs, each writes immediately.

**Gaps:** no dirty-state warning; no diff preview before save; no rollback/version history; no field help text.

**Full upgrade (~5–8 h):** `isDirty` + `beforeunload` warning; diff modal before save; settings version history (reuse existing audit entries); per-field tooltips.

---

## 13. New-Requirement Enhancements (not "shallow" — net new, but quality matters)

These are covered as features in the FRD; the quality notes below matter for adoption.

- **Fee management:** make the parent-facing balance view dead simple and reassuring; receipts must look official (GRA-style with reference). Reminder SMS copy should be polite and clear.
- **SMS (Hubtel):** keep messages short, branded with sender ID, and category-tagged for cost reporting. Always log; never block a request on a send.
- **Scheme of Learning:** the 17-field form is long — save drafts aggressively, allow the upload alternative, and let teachers clone last week's plan as a starting point.
- **Appointment slots:** show the three named slots as clear choices; let teachers add a comment and propose an alternative slot rather than only accept/decline.

---

## 14. Recommended Depth Programme

If running a focused "depth quarter" alongside the migration and procurement features:

1. **Student profile depth** (parents see first)
2. **Audit log filters** (cheap admin trust)
3. **Report card polish** — batch print + class-average + staff requests (time it before an end-of-term)
4. **Leave management** min upgrade (monthly staff use; the Head's dashboard already surfaces leave)
5. **Staff profile depth** (onboarding quality)

Defer until asked: calendar week/day views, announcement scheduling, notification snooze, settings dirty-state. Real but secondary.

---

*End of Feature Enhancement Recommendations.*
