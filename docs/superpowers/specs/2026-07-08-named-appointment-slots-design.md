# Named appointment slots — design

**Date:** 2026-07-08
**Phase:** 4 — Close requirement gaps (item 3 of 7)
**Status:** Approved, ready for implementation

## Context

Parent↔teacher appointments let a parent request a time block; the block is one of three tokens in `apps/api/app/features/appointments/constants.py`'s `AppointmentSlot` (`morning` / `afternoon` / `after_school`), stored in `appointments.preferred_slot` (a `String(50)`, not a DB enum — slot labels live on the frontend so the schedule can be reworded without a migration). The teacher-comment half of the requirement already exists (`appointments.teacher_response` + `AppointmentRespond.response`).

## Goal

Replace the generic time blocks with the school's actual named break slots, with their times shown to parents.

## The slots

| Token | Label |
|---|---|
| `snack` | Snack (10:00–10:20) |
| `lunch` | Lunch (12:20–13:05) |
| `after_school` | After School (15:05–15:45) |

`after_school` is reused; `morning`/`afternoon` are removed; `snack`/`lunch` are added.

## Non-goals

- No DB migration — `preferred_slot` is a free `String(50)`; only the app-level `Literal` narrows the accepted set.
- No change to appointment status flow, teacher response, or scheduling logic.

## Architecture

Backend:
- `appointments/constants.py` — replace the `MORNING`/`AFTERNOON`/`AFTER_SCHOOL` constants + `AppointmentSlot` `Literal` with `SNACK`/`LUNCH`/`AFTER_SCHOOL` and `Literal["snack","lunch","after_school"]`; update the docstring.
- `appointments/tests/test_router.py` — the create-payload `"preferredSlot": "morning"` → `"snack"`.
- `scripts/seed/comms.py` — the two seeded appointments' `preferred_slot` (`afternoon`, `morning`) → new tokens, so re-seeding yields valid rows.

Frontend:
- `features/appointments/types.ts` — the `AppointmentSlot` union + `SLOT_LABELS` (new tokens + times).
- `features/appointments/components/ParentAppointmentsView.tsx` — the create-form's `z.enum([...])`, the two `preferredSlot: "morning"` defaults, and the three hardcoded `<SelectItem value="…">` rows.
- `TeacherAppointmentsInbox.tsx` — no change; it renders `SLOT_LABELS[preferredSlot]`, so it picks up the new labels automatically.

## Data note

No migration. Any *pre-existing* appointment row with `morning`/`afternoon` would fail the tightened `Literal` on read — but dev is fixed by re-seeding (which this change does), and prod has no appointments yet, so there's nothing to remap. If real appointments existed, they'd need a one-off `UPDATE appointments SET preferred_slot = …` remap — noted, not needed now.

## Testing

The existing appointment router tests exercise create + read with a slot value (updated to `snack`). Run the backend suite + eslint/tsc/build, and re-seed dev to confirm the two seeded appointments read back cleanly through the tightened `Literal`.

## Open questions

None — the three named slots + times were given in the requirement; token values (`snack`/`lunch`/`after_school`) follow the existing snake-case convention.
