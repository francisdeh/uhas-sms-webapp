"""Comms group — announcements, calendar events, and appointments."""

from __future__ import annotations

from datetime import date, datetime
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.announcements.audience import format_all, format_class, format_division
from app.features.announcements.model import Announcement
from app.features.appointments.model import Appointment
from app.features.calendar.model import CalendarEvent
from app.scripts.seed.academic import AcademicResult
from app.scripts.seed.identity import IdentityResult


async def seed_comms(
    session: AsyncSession, identity: IdentityResult, academic: AcademicResult
) -> None:
    school_id = academic.school_id
    admin_id = identity.staff_ids["STAFF-001"]
    jhs1 = academic.rosters["class-jhs1"]

    session.add_all(
        [
            Announcement(
                id=uuid4(),
                school_id=school_id,
                title="Term 2 resumes Monday 12th January",
                body="All staff and students are expected in school by 7:30am on Monday "
                "12th January for the start of Term 2.",
                audience=format_all(),
                is_critical=True,
                created_by_id=admin_id,
            ),
            Announcement(
                id=uuid4(),
                school_id=school_id,
                title="JHS mock exam timetable released",
                body="The mock exam timetable for JHS 1-3 is now available from the "
                "JHS Deputy Head's office.",
                audience=format_division("JHS"),
                is_critical=False,
                created_by_id=identity.staff_ids["STAFF-002"],
            ),
            Announcement(
                id=uuid4(),
                school_id=school_id,
                title="JHS 1 field trip permission slips due",
                body="Please return signed permission slips for the Ho Zoo field trip by Friday.",
                audience=format_class(jhs1.class_id),
                is_critical=False,
                created_by_id=jhs1.teacher_staff_id,
            ),
        ]
    )

    session.add_all(
        [
            CalendarEvent(
                id=uuid4(),
                school_id=school_id,
                title="Term 2 begins",
                start_date=date(2026, 1, 12),
                end_date=None,
                type="term_start",
                created_by_id=admin_id,
            ),
            CalendarEvent(
                id=uuid4(),
                school_id=school_id,
                title="Term 2 ends",
                start_date=date(2026, 4, 3),
                end_date=None,
                type="term_end",
                created_by_id=admin_id,
            ),
            CalendarEvent(
                id=uuid4(),
                school_id=school_id,
                title="Mid-Term exams",
                start_date=date(2026, 2, 16),
                end_date=date(2026, 2, 20),
                type="exam",
                created_by_id=admin_id,
            ),
            CalendarEvent(
                id=uuid4(),
                school_id=school_id,
                title="Independence Day",
                start_date=date(2026, 3, 6),
                end_date=None,
                type="holiday",
                created_by_id=admin_id,
            ),
            CalendarEvent(
                id=uuid4(),
                school_id=school_id,
                title="Inter-house sports",
                start_date=date(2026, 3, 20),
                end_date=None,
                type="event",
                created_by_id=admin_id,
            ),
        ]
    )

    primary_guardian_id = identity.guardian_ids["guardian-001"]
    p4_student_id = academic.rosters["class-p4"].student_ids[-1]  # the seeded Parent's P4 child
    session.add_all(
        [
            Appointment(
                id=uuid4(),
                school_id=school_id,
                guardian_id=primary_guardian_id,
                student_id=p4_student_id,
                teacher_id=academic.rosters["class-p4"].teacher_staff_id,
                preferred_date=date(2026, 2, 5),
                preferred_slot="lunch",
                reason="Would like to discuss progress in Mathematics.",
                status="confirmed",
                teacher_response="Happy to meet — see you then.",
                responded_at=datetime(2026, 1, 25),
            ),
            Appointment(
                id=uuid4(),
                school_id=school_id,
                guardian_id=identity.guardian_ids["guardian-003"],
                student_id=academic.rosters["class-jhs2"].student_ids[0],
                teacher_id=academic.rosters["class-jhs2"].teacher_staff_id,
                preferred_date=date(2026, 2, 10),
                preferred_slot="snack",
                reason="Concerned about recent attendance.",
                status="pending",
            ),
        ]
    )

    await session.flush()
