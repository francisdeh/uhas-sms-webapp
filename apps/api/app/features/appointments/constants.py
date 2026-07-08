"""Closed sets for the Appointments domain.

Two orthogonal state machines live here:

  1. `AppointmentStatus` — a single status per row:
       pending ──confirm──► confirmed
       pending ──decline──► declined
       pending ──cancel──► cancelled (parent-side only)

  2. `AppointmentSlot` — which named break the parent requested:
       snack / lunch / after_school

Both mirror the TS unions in
[apps/web/src/features/appointments/types.ts](../../../../web/src/features/appointments/types.ts).
Slot labels (incl. the actual times, e.g. "Snack (10:00-10:20)") live on
the frontend — the DB just stores the token so the schedule can be
reworded without a migration.
"""

from __future__ import annotations

from typing import Final, Literal

# Status
PENDING: Final = "pending"
CONFIRMED: Final = "confirmed"
DECLINED: Final = "declined"
CANCELLED: Final = "cancelled"

AppointmentStatus = Literal["pending", "confirmed", "declined", "cancelled"]

# Slot — the school's named break periods (times shown on the frontend).
SNACK: Final = "snack"
LUNCH: Final = "lunch"
AFTER_SCHOOL: Final = "after_school"

AppointmentSlot = Literal["snack", "lunch", "after_school"]

# Decision — the shape the teacher submits when responding.
CONFIRM: Final = "confirm"
DECLINE: Final = "decline"

Decision = Literal["confirm", "decline"]

# Sentinel that appears in a `TeacherOption.subjects` list when the
# teacher is the class teacher (form teacher) rather than a subject
# teacher for the child's class. The FE picker renders it as a badge —
# see `apps/web/src/features/appointments/components/ParentAppointmentsView.tsx`.
# The TS side uses the same literal in
# `apps/web/src/features/appointments/actions/index.ts`; both sides must
# stay in sync until we retire the TS layer.
CLASS_TEACHER_SENTINEL: Final = "Class Teacher"
