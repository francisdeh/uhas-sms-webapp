# Guardian & Sibling Management — Design (Slice 1 of Phase 4 item 5)

Phase 4 item 5 ("guardians + siblings + staff-as-guardian") is three dependency-ordered slices. This is **Slice 1: guardian & sibling management** — the data + UI foundation. Later slices: (2) guardian logins + phone-OTP provisioning; (3) staff-as-guardian + staff-children filter. Both build on this.

## Problem

Guardians and their student links exist only via the seed script today. There is no API or UI to add, link, unlink, or list a student's guardians. `POST /students` ignores guardians, `is_primary` is written but never read, and the admin student-detail page hard-codes `guardian = null`. Siblings don't exist as a concept.

## Decisions (from brainstorming)

- Guardian entry lives in **both** student registration (one required guardian) and a **detail Guardian tab** (full up-to-two management).
- "Add a guardian" supports **create-new OR link-existing** — linking an existing guardian to a second student is the mechanism that makes them siblings.
- `relation` is a **constrained set** (Mother, Father, Guardian, Grandparent, Aunt, Uncle, Other).
- `primary` is a **display-only badge** — the existing single-guardian consumers (report-card contact, notifications) keep their current `.limit(1)`; primary is not wired into them this slice.
- **App-layer enforcement only** — no new DB constraints this slice.

## Data & constraints — no migration

The `student_guardians` link (composite PK `(student_id, guardian_id)`, `relation varchar(50)`, `is_primary bool`) already carries everything needed.

- **Max-two**: app-layer count guard — adding a 3rd guardian → 409.
- **Relation**: a centralized `RELATION_TYPES` Literal, validated in Pydantic; DB column unchanged.
- **Primary**: app-layer — setting one guardian primary clears the others; purely drives the badge.
- Cleanup: the `Guardian` model docstring claims an "email-or-phone" DB CHECK that does not exist (enforced only in `GuardianCreate` Pydantic). Fix the stale docstring; add no constraint.

## API surface

New endpoints in the students feature (all school-scoped, camelCase wire):

- `GET /students/{id}/guardians` → `list[StudentGuardianRead]` (guardian id/slug/name, `relation`, `isPrimary`, phone, email). Replaces the hard-coded `null`.
- `POST /students/{id}/guardians` → add a guardian. Body `StudentGuardianAddRequest`: `relation: RelationType`, `isPrimary: bool = False`, and **exactly one of** `guardianId` (link existing) or `newGuardian: GuardianCreate` (create + link). Validator enforces the XOR. Rules: max-two (409 if already 2), 409 if already linked, new-guardian reuses `GuardiansService.create` email/phone dedupe.
- `PATCH /students/{id}/guardians/{guardianId}` → `StudentGuardianUpdateRequest` (`relation?`, `isPrimary?`). Setting `isPrimary=true` clears other primaries.
- `DELETE /students/{id}/guardians/{guardianId}` → unlink. Removes the link row only; the guardian record stays (may belong to a sibling or later have a login).
- `GET /students/{id}/siblings` → `list[SiblingRead]` (student id, slug, name, className) — students sharing any of this student's guardians, excluding self, deduped.
- `POST /students` gains optional `guardians: list[StudentGuardianAddRequest] = []` so registration creates student + enrollment + first guardian in one transaction. Max-two enforced here too.

**Service**: guardian-link methods live in the students feature (`StudentsService` or a focused `guardian_links` module if it bloats): `list_guardians`, `add_guardian`, `update_guardian_link`, `remove_guardian`, `list_siblings`. New-guardian creation reuses `GuardiansService.create`.

**Gating**: mutations `RequireAdmin` (matches existing guardian CRUD). Reads (guardians, siblings): Admin (any) + DeputyHead (student's active-class division must match). Teacher/parent access deferred.

**Audit**: add `GUARDIAN_LINKED` / `GUARDIAN_UNLINKED` actions; audit-log add + unlink (currently unaudited because nothing writes links yet).

## Frontend

- **Registration** (`StudentRegistrationForm`): a Guardian section capturing **one** required guardian — create/link toggle. Create = first/last name + relation select + phone/email (email-or-phone required, mirrored in Zod). Link = search existing via `api.guardians.list({ q })`. Included in the student-create payload. Relabel the misleading "Parent/Guardian Phone" field (it maps to `student.phone`) to "Student Phone".
- **Detail Guardian tab** (`StudentDetail`): list **all** guardians (relation, primary badge, contact, guardian ID); "Add guardian" (disabled at 2) → create/link dialog; per-guardian unlink (confirm dialog), edit relation, set primary. A **Siblings** section lists shared-guardian students linking to their profiles. Wire the detail data-fetch to the two new reads (replacing `guardian = null`), on both the admin and deputy-head detail pages.
- Client methods (`api.students.guardians/siblings/addGuardian/updateGuardianLink/removeGuardian`) + TanStack hooks (invalidate on success, `ApiError` → `toast.error`). Guardian search reuses `api.guardians.list`. Combobox via shadcn `command` + `popover` (add if missing).
- Types: `RelationType` union (mirrors backend), `GuardianLink`, `Sibling`.

## Testing

**API**: max-two → 409; link-existing → both students list each other as siblings; unlink removes the link but keeps the guardian row; new-guardian email/phone dedupe; invalid relation → 422; siblings excludes self + dedupes across shared guardians; deputy own-division read OK / other-division 403; mutations reject non-admin (deputy/teacher → 403); XOR validation (both/neither guardianId+newGuardian → 422).

**Web**: registration guardian create + link paths; detail lists guardians + siblings; add dialog both modes; unlink confirm. Lint, tsc, Vitest, build, OpenAPI→TS drift.

## Out of scope (later slices)

- Guardian logins + phone-OTP provisioning (slice 2).
- Staff-as-guardian + staff-children marker/filter (slice 3).
- Parent-facing sibling view (Phase 6).
- Wiring `primary` into report-card contact / notifications (kept on `.limit(1)`).
