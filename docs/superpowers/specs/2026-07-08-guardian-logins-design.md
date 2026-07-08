# Guardian Logins + Co-guardian View — Design (Slice 2 of Phase 4 item 5)

Slice 1 built guardian↔student management. This slice gives guardians a way to actually log in — including **phone-OTP**, which no non-seeded guardian can use today — and lets a parent see the co-guardian(s) of their own child.

## Problem

Guardian login is provisioned through the `users` feature: for role `Parent`, `UsersService.create` validates `linked_id` → a guardian, calls `invite_user_by_email` (email-only), then `update_user_by_id` to set `app_metadata`. It sets **no phone**, and Supabase's invite API is email-only, so phone-OTP login works only for the seeded accounts. In the Ghana context many parents have a phone but no email.

Separately, a parent cannot see the co-guardian(s) of their child: `GET /students/{id}/guardians` is gated Admin + own-division Deputy (`_assert_can_view_student`), so a Parent gets 403.

## Decisions (from brainstorming)

- **Provision whatever they have** — phone (+ `phone_confirm`) enables OTP; email sends an invite; both when both; neither → 400. Email is optional for guardians.
- **Both triggers** — a per-guardian action on the student-detail Guardian tab AND phone capture in the admin Users dialog.
- **Co-guardian display** shows **full contact** (name, relationship, phone, email); the logged-in parent is marked "You".
- **One-login-per-guardian** enforced **app-layer** (409), no migration.

## Provisioning model

`UsersService.provision_login(...)` is the single shared path; both endpoints call it.

1. Validate the link (`_validate_link`): Parent → guardian in school; else staff.
2. **One-login guard** (app-layer): if a `users` row already links `linked_id` → `ConflictError` (409).
3. Resolve `email` / `phone` (from the guardian record for the guardian endpoint; from the request for the admin dialog).
4. Branch:
   - **email present** → `invite_user_by_email(email, redirect=/change-password)` → auth uid; then `update_user_by_id(uid, phone=phone, phone_confirm=bool(phone), app_metadata, user_metadata={must_change_password: true})`.
   - **email absent, phone present** → `create_user(phone=phone, phone_confirm=true, password=<random>, app_metadata, user_metadata={must_change_password: false})`. The random password is never used — the guardian logs in via OTP.
   - **neither** → `ValidationError` (400).
5. Insert the local `User` bridge row (`id = auth uid`, `linked_id`, `role`, `must_change_password`).
6. **Audit-log** `USER_CREATED` (new action — user creation is currently unaudited).

### Supabase admin wrapper (`users/supabase_admin.py`)

Extend the closed `SupabaseAdminClient` Protocol + real client + not-configured stub + test `FakeSupabaseAdminClient`, in lockstep:
- `create_user(..., phone: str | None = None, phone_confirm: bool = False)` — real client adds `phone`/`phone_confirm` to the `auth.admin.create_user` payload; also make `email`/`password` tolerant of the phone-only case.
- `update_user_by_id(..., phone: str | None = None, phone_confirm: bool = False)` — real client adds them to its payload dict.
- The Fake records `phone`/`phone_confirm` in `create_calls`/`update_calls` so tests assert without a real Supabase.

Reality note: this makes accounts OTP-*capable*; SMS delivery in production still depends on Supabase's SMS provider (Twilio/Hubtel) being configured — a deploy concern, out of scope.

## Endpoints

- `POST /guardians/{id}/login` (new, `RequireAdmin`) — sources email/phone from the guardian, provisions (role Parent, `linked_id = guardian.id`), returns the created `UserRead`.
- `POST /users` (existing, `RequireAdmin`) — `UserCreate` gains `phone: str | None`; `email` becomes optional. Validator: Parent requires email-or-phone; non-Parent roles still require email. Routes through `provision_login`.
- `StudentGuardianRead` gains `has_login: bool` — `list_guardians` left-joins `users` on `linked_id`; the Guardian tab shows status + disables the action when a login exists.
- `UsersRepository.find_by_linked_id(school_id, linked_id)` backs the one-login guard.

## Co-guardian parent access

In `StudentsService.list_guardians`, before the Admin/Deputy gate: allow a Parent whose `linked_id` is a guardian of the student (reuse `StudentsRepository.get_link(student_id, user.linked_id)`). `list_siblings` keeps the Admin/Deputy-only gate — parent-facing siblings stays a Phase 6 item. The full-contact serializer (`_guardian_to_read`) is unchanged.

## Frontend

- **Guardian tab** (`GuardianTab.tsx`): per-guardian login status badge + "Create login / Invite" action (disabled when `hasLogin`), calling `api.guardians.createLogin(guardianId)`; toast on success.
- **Admin Users dialog** (`UsersTable.tsx`): add a phone field; when role = Parent, email is optional (require email-or-phone in the Zod schema); success message reflects phone vs email.
- **Parent child view**: a "Guardians" section listing all guardians of the child (name, relationship, contact), the logged-in parent marked "You", via `api.students.guardians(childId)`.
- Client methods (`api.guardians.createLogin`), hooks, regenerated `api.d.ts`.

## Testing

**API**: phone-only → `create_user` with `phone`+`phone_confirm`, no invite; email → invite (+ phone on update when present); neither → 400; second login for a guardian → 409; `POST /users` Parent phone-only OK, staff role still requires email; parent reads own child's co-guardians (200), another child → 403, siblings still 403; `has_login` reflected in the list. Assertions read the `FakeSupabaseAdminClient` call records.

**Web**: lint, tsc, Vitest, build, OpenAPI→TS drift.

## Out of scope (later)

- Real prod SMS delivery (Supabase SMS provider config).
- Parent-facing siblings (Phase 6).
- Relinking `linked_id` after creation.
- DB-level `linked_id` uniqueness (app-layer guard only this slice).
- Staff-as-guardian + staff-children filter (slice 3).
