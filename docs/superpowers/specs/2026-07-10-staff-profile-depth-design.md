# Staff Profile Depth — Design

**Phase 6 item 4** of `v2/UHAS_Migration_Execution_Plan.md` §10: "hire date, qualifications, subject expertise, documents." Unlike the student-profile-depth audit, this one confirmed the backlog is accurately scoped — genuinely ~0% built at the model layer (no `hire_date`, no qualifications, no subject-expertise link, no staff documents beyond `photo_url`).

## Context

- Staff reads (`GET /staff`, `GET /staff/{id}`) have no role gate today — any authenticated user can view any staff record. Mutations are Admin-only except a narrow self-service exception (`_SELF_SERVICE_FIELDS = {"photo_url"}`).
- `class_subjects.teacher_id` is an *assignment* FK, not a *capability* list — no existing notion of "subjects this teacher is qualified to teach."
- The just-shipped `StudentDocument` table (label/other_label/storage_path/uploaded_by_id) is a clean, near-identical mirror for staff documents.

## Hire date

One nullable `hire_date: Date` column on `staff`. Included in the existing `StaffRead`/`StaffUpdate` (already open-read, Admin-write) — no new gate needed, matches the existing precedent for this table.

## Subject expertise

New join table `staff_subject_expertise` (`staff_id`, `subject_id`) — which subjects a teacher is *qualified* to teach, distinct from `class_subjects.teacher_id`'s current-assignment meaning. Simple tag-list UX: full-replace semantics.

- `GET /staff/{id}/subjects` — open (matches existing staff-read precedent).
- `PUT /staff/{id}/subjects` — Admin only, body is the complete new `subject_id` list (replace, not incremental add/remove).

## Qualifications

New child table `staff_qualifications` (id, school_id, staff_id, name, institution, year_obtained, created_at) — structured, not free text, mirroring the documents child-table convention.

- `GET /staff/{id}/qualifications` — open.
- `POST /staff/{id}/qualifications` — Admin only.
- `DELETE /staff/{id}/qualifications/{id}` — Admin only.

## Documents

New child table `staff_documents` — same shape as `student_documents` (id, school_id, staff_id, label, other_label, storage_path, uploaded_by_id, created_at). Label closed set: `Certificate`, `Contract`, `National ID`, `CV`, `Other`.

**Access — deliberately narrower than the rest of this feature's open-read precedent**: certificates/contracts are more sensitive than a hire date or a subject tag.

- `GET /staff/{id}/documents` — Admin any, or the staff member viewing their own record (`user.linked_id == staff_id`).
- `POST` / `DELETE` — Admin only.

## Frontend

- Admin `StaffDetail.tsx` gains: hire date field (Profile tab), a "Subjects" tag editor, a "Qualifications" list, a "Documents" list/upload — all direct extensions of the existing two-tab layout, not a redesign.
- Self-service `/profile` page gains a read-only "My Documents" section (view/download own staff documents only — no upload, matching the Admin-only-upload gate).
- New `UploadKind` case `"staff/document"` in `storage.ts`.

Per this session's UI-workflow correction: all frontend work is written directly, not dispatched to a subagent.

## Testing

**Backend**: hire_date read/write; subject-expertise full-replace (Admin only, open read); qualifications add/remove (Admin only, open read); documents access gate (Admin view/upload/delete any, self view-only, other staff/roles forbidden).

**Frontend**: Vitest coverage for any non-trivial component logic.
