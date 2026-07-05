"""Wipes every business-data table before a fresh seed.

A single multi-table `TRUNCATE ... CASCADE` — Postgres resolves FK
ordering across all listed tables in one statement, and `CASCADE`
catches anything not listed that still references one of them (e.g.
`audit_log`, `sms_log`, `notifications` — real operational tables this
script doesn't reseed, but which should still be empty after a reset).
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_TABLES: tuple[str, ...] = (
    "appointments",
    "calendar_events",
    "announcements",
    "notifications",
    "student_report_remarks",
    "class_report_submissions",
    "assignments",
    "schemes",
    "lesson_plan_reviews",
    "lesson_plans",
    "leave_requests",
    "staff_attendance_records",
    "staff_attendance_sessions",
    "attendance_records",
    "attendance_sessions",
    "scores",
    "exams",
    "enrollments",
    "class_subjects",
    "class_teachers",
    "classes",
    "subjects",
    "student_guardians",
    "students",
    "sms_log",
    "users",
    "guardians",
    "staff",
    "school_terms",
    "schools",
    "audit_log",
)


async def reset_all(session: AsyncSession) -> None:
    await session.execute(text(f"TRUNCATE TABLE {', '.join(_TABLES)} CASCADE"))
