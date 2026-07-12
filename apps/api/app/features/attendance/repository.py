"""Data-access layer for student attendance.

`list_sessions` returns summary rows (session + aggregate counts) so
the list UI doesn't need a fan-out of records; the detail endpoint
loads records separately.
"""

from __future__ import annotations

from datetime import date as date_type
from uuid import UUID

from sqlalchemy import and_, asc, case, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.attendance.constants import ABSENT, EXCUSED, LATE, PRESENT
from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.classes.model import Class
from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.users.model import User


class AttendanceRepository:
    @staticmethod
    async def find_session(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        class_id: UUID | str,
        date: date_type,
    ) -> AttendanceSession | None:
        """Natural-key lookup — session is `(school, class, date)`."""
        stmt = select(AttendanceSession).where(
            and_(
                AttendanceSession.school_id == school_id,
                AttendanceSession.class_id == class_id,
                AttendanceSession.date == date,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_session(
        session: AsyncSession, school_id: UUID | str, session_id: UUID | str
    ) -> tuple[AttendanceSession, Class, Staff | None] | None:
        """Fetch session + joined class + submitter (for detail response)."""
        stmt = (
            select(AttendanceSession, Class, Staff)
            .join(Class, Class.id == AttendanceSession.class_id)
            .outerjoin(Staff, Staff.id == AttendanceSession.submitted_by_id)
            .where(
                and_(
                    AttendanceSession.id == session_id,
                    AttendanceSession.school_id == school_id,
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1], row[2]) if row else None

    @staticmethod
    async def list_records(
        session: AsyncSession, session_id: UUID | str
    ) -> list[tuple[AttendanceRecord, Student]]:
        """Records + joined student — sorted by last name for the roster UI."""
        stmt = (
            select(AttendanceRecord, Student)
            .join(Student, Student.id == AttendanceRecord.student_id)
            .where(AttendanceRecord.session_id == session_id)
            .order_by(asc(Student.last_name), asc(Student.first_name))
        )
        return [(rec, st) for rec, st in (await session.execute(stmt)).all()]

    @staticmethod
    async def list_primary_guardians_for_students(
        session: AsyncSession, school_id: UUID | str, student_ids: set[UUID]
    ) -> list[tuple[Student, Guardian, User | None]]:
        """Every (student, primary guardian, guardian's app user if any)
        for the given students — the fan-out list for
        `email/attendance-absent.requested` + the in-app
        `ATTENDANCE_ABSENT` notification. Skips students with no
        primary guardian on file. Same join shape as
        `ExamsRepository.list_published_recipients`."""
        if not student_ids:
            return []
        stmt = (
            select(Student, Guardian, User)
            .join(
                StudentGuardian,
                and_(
                    StudentGuardian.student_id == Student.id,
                    StudentGuardian.is_primary.is_(True),
                ),
            )
            .join(Guardian, Guardian.id == StudentGuardian.guardian_id)
            .outerjoin(User, User.linked_id == Guardian.id)
            .where(and_(Student.school_id == school_id, Student.id.in_(student_ids)))
        )
        rows = (await session.execute(stmt)).all()
        return [(s, g, u) for s, g, u in rows]

    @staticmethod
    async def delete_records(session: AsyncSession, session_id: UUID | str) -> None:
        """Wipe records for a session — the upsert path re-inserts them.

        Simpler than diff-then-update and gives the same outcome; row
        volume is tiny (a class has ~30-40 students).
        """
        stmt = select(AttendanceRecord).where(AttendanceRecord.session_id == session_id)
        for row in (await session.execute(stmt)).scalars().all():
            await session.delete(row)
        await session.flush()

    @staticmethod
    async def list_sessions(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        class_id: UUID | str | None = None,
        term: int | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[AttendanceSession, Class, Staff | None, int, int, int, int]], int]:
        """Return session summaries + total count.

        Aggregates the per-status record counts with a CASE / SUM group-by,
        so the response includes `presentCount` / `absentCount` / etc.
        without a second query per session.
        """
        counts = (
            select(
                AttendanceRecord.session_id.label("session_id"),
                func.sum(case((AttendanceRecord.status == PRESENT, 1), else_=0)).label("p"),
                func.sum(case((AttendanceRecord.status == ABSENT, 1), else_=0)).label("a"),
                func.sum(case((AttendanceRecord.status == LATE, 1), else_=0)).label("l"),
                func.sum(case((AttendanceRecord.status == EXCUSED, 1), else_=0)).label("e"),
            )
            .group_by(AttendanceRecord.session_id)
            .subquery()
        )

        where = [AttendanceSession.school_id == school_id]
        if class_id:
            where.append(AttendanceSession.class_id == class_id)
        if term is not None:
            where.append(AttendanceSession.term == term)

        where_clause = and_(*where)
        total = int(
            (
                await session.execute(select(func.count(AttendanceSession.id)).where(where_clause))
            ).scalar_one()
            or 0
        )

        offset = (page - 1) * size
        rows_stmt = (
            select(
                AttendanceSession,
                Class,
                Staff,
                func.coalesce(counts.c.p, 0),
                func.coalesce(counts.c.a, 0),
                func.coalesce(counts.c.l, 0),
                func.coalesce(counts.c.e, 0),
            )
            .join(Class, Class.id == AttendanceSession.class_id)
            .outerjoin(Staff, Staff.id == AttendanceSession.submitted_by_id)
            .outerjoin(counts, counts.c.session_id == AttendanceSession.id)
            .where(where_clause)
            .order_by(desc(AttendanceSession.date), asc(Class.name))
            .offset(offset)
            .limit(size)
        )
        rows = [
            (sess, cls, staff, int(p), int(a), int(late_ct), int(exc))
            for sess, cls, staff, p, a, late_ct, exc in (await session.execute(rows_stmt)).all()
        ]
        return rows, total

    @staticmethod
    async def sum_status_counts_for_student(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        student_id: UUID | str,
        term_start: date_type,
        term_end: date_type,
    ) -> dict[str, int]:
        """Group-by-status count of a student's attendance records within
        the date range. One round-trip; caller maps the DB status strings
        into wire counts."""
        stmt = (
            select(
                AttendanceRecord.status.label("status"),
                func.count().label("count"),
            )
            .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
            .where(
                and_(
                    AttendanceSession.school_id == school_id,
                    AttendanceRecord.student_id == student_id,
                    AttendanceSession.date >= term_start,
                    AttendanceSession.date <= term_end,
                )
            )
            .group_by(AttendanceRecord.status)
        )
        return {status: int(count) for status, count in (await session.execute(stmt)).all()}

    @staticmethod
    async def per_day_status_for_student(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        student_id: UUID | str,
        term_start: date_type,
        term_end: date_type,
    ) -> list[tuple[date_type, str]]:
        """Return `(date, status)` for every recorded session-day of a
        student within the range, oldest first."""
        stmt = (
            select(AttendanceSession.date, AttendanceRecord.status)
            .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
            .where(
                and_(
                    AttendanceSession.school_id == school_id,
                    AttendanceRecord.student_id == student_id,
                    AttendanceSession.date >= term_start,
                    AttendanceSession.date <= term_end,
                )
            )
            .order_by(asc(AttendanceSession.date))
        )
        return [(d, s) for d, s in (await session.execute(stmt)).all()]
