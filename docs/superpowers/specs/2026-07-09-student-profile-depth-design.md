# Student Profile Depth — Design

**Phase 6 item 1** of `v2/UHAS_Migration_Execution_Plan.md` §10 — the plan's stated top priority ("what UHAS hits first"). Backlog phrasing was "siblings, all guardians, medical, documents — parent-facing"; a pre-design audit found this substantially overstates the remaining work.

## Context

Contrary to the one-line backlog description, most of this item is already built:

- **Siblings**: fully implemented (`SiblingRead` schema, `GET /students/{id}/siblings`, `StudentsRepository.list_siblings`, rendered in the Admin `GuardianTab.tsx`, tested) — derived from shared-guardian rather than an explicit sibling FK, and correct as such. The only gap: `StudentsService.list_siblings`'s auth gate is Admin/Deputy-only, with a code comment explicitly flagging it as deferred: *"Siblings stay Admin/Deputy-only; that's a Phase 6 parent item."*
- **All-guardians display**: already fully built on both Admin (`GuardianTab.tsx`) and Parent (`/parent/children/page.tsx`, via `api.students.guardians(s.id)`) sides. No work needed.
- **Medical info**: 0% built — no field exists on `students` anywhere.
- **Documents**: 0% built — `storage.ts`'s `UploadKind` has only `students/photo`; no document upload/list feature exists for students.

`CLAUDE.md`'s "What NOT to Do" list still excluded "medical" features (stale, same pattern as the fee-management conflict fixed in Phase 5) — narrowed during this session's brainstorm to exclude only payroll/counselling, with basic student medical info now noted as in-scope.

## Siblings → Parent access

`StudentsService.list_siblings` gets the same parent-bypass `list_guardians` already has: a parent linked to the student (`StudentsRepository.get_link(session, student_id, user.linked_id)` returns non-null) may view siblings; everyone else still goes through `_assert_can_view_student` (Admin any, Deputy own division). No repository/schema changes — this is an auth-gate change only.

Frontend: a "Siblings" section on the parent's child view (`/parent/children` or a per-child detail), listing each sibling's name + class, matching the existing rendering already used in Admin's `GuardianTab.tsx`.

## Medical info

Four new nullable columns directly on `students` (not a child table — this is one-row-per-student data, no need for history/multiplicity):

- `blood_type`: closed set — `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, `Unknown` (`Final` constants + `Literal`, per convention).
- `medical_notes`: free text (allergies, conditions — deliberately unstructured, a school nurse/teacher reads this, doesn't query it).
- `emergency_contact_name`, `emergency_contact_phone`: text — may differ from any guardian on file (e.g. a nearby relative, not a legal guardian).

**Access — corrected mid-implementation.** The original plan was to fold these fields into the existing `StudentRead` (`GET /students/{id}`), gated to Admin/Deputy/Teacher-write and Admin/Deputy/parent-edit. Implementation surfaced that `GET /students/{id}` (and `GET /students`) has **no role/ownership gate at all today** — any authenticated user in the school, any role, can already fetch any student's full record. Embedding medical fields there would have leaked health data to every Teacher/Parent/Accountant in the school, not just the ones with a real relationship to that student. Medical info therefore got its own gated endpoints instead, mirroring how `guardians`/`siblings` are already separate gated sub-resources rather than baked into the base read:

- `GET /students/{id}/medical` (`StudentMedicalRead`) — Admin any; Deputy own division; Teacher who class-teaches or subject-teaches the student's current class (new gate, `_assert_can_view_medical`, reusing the `ClassTeacher`/`ClassSubject` union check `attendance/service.py` already uses for an equivalent purpose); the student's own parent.
- `PATCH /students/{id}/medical` (`StudentMedicalUpdate`) — Admin, or the student's own parent, only. Deputy is deliberately excluded from the *write* despite having read access — every other student-record mutation in this feature (guardians, core fields) is Admin-only too, so this follows that existing precedent rather than the broader Admin+Deputy write pattern used elsewhere in the codebase (e.g. `RequireAdminOrDeputy`).

## Documents

New child table `student_documents` (mirrors the `scheme_comments`/`scheme_weekly_entries` child-table shape, not a JSONB array — each document needs its own label and an accountable uploader, which a bare path-array can't carry):

- `id`, `school_id`, `student_id` FK
- `label`: closed set — `Birth Certificate`, `Ghana Card`, `Immunization Record`, `Transfer Letter`, `Passport Photo`, `Other` (with a free-text `other_label` when `label="Other"`)
- `storage_path`: Supabase Storage path (`documents` bucket, private — same signed-URL pattern as schemes/lesson-plans/fee-receipts)
- `uploaded_by_id` FK → staff
- `created_at`

**Access**: view — Admin, Deputy (own division), the student's own parent (no Teacher access — unlike medical info, there's no emergency case for a teacher needing a birth certificate). Upload/delete — Admin only, matching the same Admin-only-mutation precedent as medical writes (Deputy can view but not manage documents, same as every other student-record mutation in this feature).

Frontend: new `UploadKind` case `"students/document"` in `storage.ts`; a documents list/upload section on the Admin student-detail page and a read-only equivalent on the parent's child view, both using `ClientDocumentDownloadLink` for downloads (existing pattern).

## Testing

**Backend**: siblings-for-parent (own child allowed, other guardian's child forbidden — mirrors existing `list_guardians` parent-bypass tests); medical info CRUD + the three-way access gate (Admin/Deputy/own-parent write allowed, Teacher/other-parent write forbidden, Teacher read allowed); student-documents CRUD + access gate (Admin/Deputy upload/delete, parent view-only, other roles forbidden).

**Frontend**: Vitest coverage for any non-trivial component logic, matching existing conventions.

## Explicitly out of scope

- Immunization records, ongoing medication, doctor/clinic contact — rejected as "closer to a real health file" than this school needs; `medical_notes` free text covers it if ever needed.
- A structured document type beyond the closed label set — "Other" + free text covers ad-hoc cases without needing per-school configurable document types.
