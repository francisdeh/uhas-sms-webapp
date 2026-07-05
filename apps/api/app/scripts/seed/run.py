"""Entrypoint — wipes and re-seeds every business-data table.

    uv run python -m app.scripts.seed

Refuses to run against `settings.env == "production"`. Reset-only by
design (see the seed-script design discussion) — there's no upsert
mode, since every ID here is either deterministic (schools/staff/
guardians the Supabase Auth test accounts link to) or freshly random,
and `supabase db reset` already wipes the whole DB on every local
reset anyway.
"""

from __future__ import annotations

from app.core.config import settings
from app.core.db import SessionLocal
from app.scripts.seed.academic import seed_academic
from app.scripts.seed.assessment import seed_assessment
from app.scripts.seed.attendance import seed_attendance
from app.scripts.seed.comms import seed_comms
from app.scripts.seed.identity import seed_identity
from app.scripts.seed.reset import reset_all
from app.scripts.seed.workflow import seed_workflow


async def main() -> None:
    if settings.env == "production":
        raise SystemExit("Refusing to run the demo-data seed against a production environment.")

    async with SessionLocal() as session:
        print("→ Truncating business-data tables…")
        await reset_all(session)

        print("→ Seeding identity & org (school, staff, guardians, users)…")
        identity = await seed_identity(session)

        print("→ Seeding academic structure (classes, subjects, students, enrollments)…")
        academic = await seed_academic(session, identity)

        print("→ Seeding assessment (exams, scores)…")
        assessment = await seed_assessment(session, academic)

        print("→ Seeding attendance (2 weeks student + staff history, leave requests)…")
        await seed_attendance(session, identity, academic)

        print("→ Seeding workflow (lesson plans, schemes, assignments, class reports)…")
        await seed_workflow(session, identity, academic, assessment)

        print("→ Seeding comms (announcements, calendar events, appointments)…")
        await seed_comms(session, identity, academic)

        await session.commit()

    print(
        f"\nDone. Seeded 1 school, {len(identity.staff_ids)} staff, "
        f"{len(identity.guardian_ids)} guardians, {len(academic.student_ids)} students "
        f"across {len(academic.rosters)} classes."
    )
