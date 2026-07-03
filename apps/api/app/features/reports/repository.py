"""Data-access for the Reports domain.

Read-only aggregate queries. Structured to mirror the TS `get-stats.ts`
and `get-psc-report.ts` queries one-to-one for reviewability — we can
optimise per-endpoint if any of these show up hot in profiling.

Each dashboard endpoint fans out several small queries and composes the
result in Python. That trades a few extra round trips for clarity;
none of these are on the request-hot-path (dashboards refresh on
navigation, not per-keystroke).
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import and_, asc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import ADMIN, TEACHER
from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.classes.model import Class, ClassSubject
from app.features.enrollments.constants import ACTIVE as ENROLLMENT_ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.exams.constants import END_OF_TERM
from app.features.exams.model import Exam, Score
from app.features.lesson_plans.constants import (
    APPROVED as LP_APPROVED,
)
from app.features.lesson_plans.constants import (
    DRAFT as LP_DRAFT,
)
from app.features.lesson_plans.constants import (
    REJECTED as LP_REJECTED,
)
from app.features.lesson_plans.constants import (
    SUBMITTED as LP_SUBMITTED,
)
from app.features.lesson_plans.constants import (
    UNIT_HEAD_APPROVED as LP_UNIT_HEAD_APPROVED,
)
from app.features.lesson_plans.model import LessonPlan
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject

# ─── Attendance status literals ────────────────────────────────────────────
# Mirror the TS `"present" | "late"` set. The FE tile treats both as
# "at school" for the last-7 attendance strip.
_ATTENDANCE_AT_SCHOOL: set[str] = {"present", "late"}

# Gender labels — the DB stores raw strings ("Male" / "Female"); no
# closed set exists yet in the students module, so keep the literals
# here and localise-only via the reports view.
_MALE = "Male"
_FEMALE = "Female"


class ReportsRepository:
    # ─── School totals ─────────────────────────────────────────────────

    @staticmethod
    async def student_count_by_active(
        session: AsyncSession, school_id: UUID | str
    ) -> tuple[int, int]:
        """Returns `(active, inactive)` student counts. Two `COUNT(*)`
        aggregates in a single query using the FILTER clause."""
        stmt = select(
            func.count().filter(Student.is_active.is_(True)),
            func.count().filter(Student.is_active.is_(False)),
        ).where(Student.school_id == school_id)
        row = (await session.execute(stmt)).one()
        return int(row[0] or 0), int(row[1] or 0)

    @staticmethod
    async def staff_count_by_active(
        session: AsyncSession, school_id: UUID | str
    ) -> tuple[int, int]:
        stmt = select(
            func.count().filter(Staff.is_active.is_(True)),
            func.count().filter(Staff.is_active.is_(False)),
        ).where(Staff.school_id == school_id)
        row = (await session.execute(stmt)).one()
        return int(row[0] or 0), int(row[1] or 0)

    @staticmethod
    async def class_count(session: AsyncSession, school_id: UUID | str, academic_year: str) -> int:
        return int(
            (
                await session.execute(
                    select(func.count(Class.id)).where(
                        and_(
                            Class.school_id == school_id,
                            Class.academic_year == academic_year,
                        )
                    )
                )
            ).scalar_one()
            or 0
        )

    @staticmethod
    async def subject_count(session: AsyncSession, school_id: UUID | str) -> int:
        return int(
            (
                await session.execute(
                    select(func.count(Subject.id)).where(Subject.school_id == school_id)
                )
            ).scalar_one()
            or 0
        )

    @staticmethod
    async def distinct_parent_count(session: AsyncSession, school_id: UUID | str) -> int:
        """Every unique guardian_id linked to any student in the given
        school. The parent count on the dashboard is "guardians linked
        to at least one student", not "user accounts with role=Parent".

        Note the tenant scope: the TS-side counterpart at
        `get-stats.ts::getSchoolStats` counts across every school,
        which is a bug. The port filters correctly."""
        stmt = (
            select(func.count(func.distinct(StudentGuardian.guardian_id)))
            .select_from(StudentGuardian)
            .join(Student, Student.id == StudentGuardian.student_id)
            .where(Student.school_id == school_id)
        )
        return int((await session.execute(stmt)).scalar_one() or 0)

    @staticmethod
    async def active_student_gender_totals(
        session: AsyncSession, school_id: UUID | str
    ) -> tuple[int, int]:
        stmt = select(
            func.count().filter(Student.gender == _MALE),
            func.count().filter(Student.gender == _FEMALE),
        ).where(and_(Student.school_id == school_id, Student.is_active.is_(True)))
        row = (await session.execute(stmt)).one()
        return int(row[0] or 0), int(row[1] or 0)

    # ─── Lesson plans + exams ──────────────────────────────────────────

    @staticmethod
    async def lesson_plan_status_counts_for_year(
        session: AsyncSession,
        school_id: UUID | str,
        academic_year: str,
    ) -> dict[str, int]:
        """`{status: count}` for lesson plans on classes in the given
        year. Soft-deleted rows excluded. The join filters to
        current-year classes so we ignore plans on archived classes."""
        stmt = (
            select(LessonPlan.status, func.count(LessonPlan.id))
            .join(Class, Class.id == LessonPlan.class_id)
            .where(
                and_(
                    LessonPlan.school_id == school_id,
                    LessonPlan.deleted_at.is_(None),
                    Class.academic_year == academic_year,
                )
            )
            .group_by(LessonPlan.status)
        )
        return {status: int(count) for status, count in (await session.execute(stmt)).all()}

    @staticmethod
    async def exam_counts_for_year(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> tuple[int, int]:
        stmt = select(
            func.count(),
            func.count().filter(Exam.is_published.is_(True)),
        ).where(and_(Exam.school_id == school_id, Exam.academic_year == academic_year))
        row = (await session.execute(stmt)).one()
        return int(row[0] or 0), int(row[1] or 0)

    @staticmethod
    async def today_session_count(session: AsyncSession, school_id: UUID | str, today: date) -> int:
        stmt = select(func.count(AttendanceSession.id)).where(
            and_(
                AttendanceSession.school_id == school_id,
                AttendanceSession.date == today,
            )
        )
        return int((await session.execute(stmt)).scalar_one() or 0)

    # ─── Division-scoped ──────────────────────────────────────────────

    @staticmethod
    async def division_classes(
        session: AsyncSession,
        school_id: UUID | str,
        academic_year: str,
        division: str,
    ) -> list[Class]:
        stmt = (
            select(Class)
            .where(
                and_(
                    Class.school_id == school_id,
                    Class.academic_year == academic_year,
                    Class.division == division,
                )
            )
            .order_by(asc(Class.name))
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def division_gender_totals(
        session: AsyncSession,
        school_id: UUID | str,
        academic_year: str,
        division: str,
    ) -> tuple[int, int, int]:
        """Returns `(total, male, female)` — active enrolments in
        classes for the division. Uses one join so all three counts
        share the same row set."""
        stmt = (
            select(
                func.count(),
                func.count().filter(Student.gender == _MALE),
                func.count().filter(Student.gender == _FEMALE),
            )
            .select_from(Enrollment)
            .join(Student, Student.id == Enrollment.student_id)
            .join(Class, Class.id == Enrollment.class_id)
            .where(
                and_(
                    Class.school_id == school_id,
                    Class.academic_year == academic_year,
                    Class.division == division,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ENROLLMENT_ACTIVE,
                    Student.is_active.is_(True),
                )
            )
        )
        row = (await session.execute(stmt)).one()
        return int(row[0] or 0), int(row[1] or 0), int(row[2] or 0)

    @staticmethod
    async def division_staff_count(
        session: AsyncSession, school_id: UUID | str, division: str
    ) -> int:
        stmt = select(func.count(Staff.id)).where(
            and_(
                Staff.school_id == school_id,
                Staff.division == division,
                Staff.is_active.is_(True),
            )
        )
        return int((await session.execute(stmt)).scalar_one() or 0)

    @staticmethod
    async def attendance_counts_for_day(
        session: AsyncSession, day: date, class_ids: list[UUID]
    ) -> tuple[int, int]:
        """`(present_count, total_count)` for the given day across the
        given classes. "Present" folds `late` in — matches the TS
        `"present" | "late"` filter."""
        if not class_ids:
            return 0, 0
        stmt = (
            select(
                func.count().filter(AttendanceRecord.status.in_(_ATTENDANCE_AT_SCHOOL)),
                func.count(),
            )
            .select_from(AttendanceRecord)
            .join(
                AttendanceSession,
                AttendanceSession.id == AttendanceRecord.session_id,
            )
            .where(
                and_(
                    AttendanceSession.date == day,
                    AttendanceSession.class_id.in_(class_ids),
                )
            )
        )
        row = (await session.execute(stmt)).one()
        return int(row[0] or 0), int(row[1] or 0)

    @staticmethod
    async def division_lesson_plans(
        session: AsyncSession,
        school_id: UUID | str,
        class_ids: list[UUID],
    ) -> dict[str, int]:
        """`{status: count}` for lesson plans on the given classes.
        Soft-deleted rows excluded."""
        if not class_ids:
            return {}
        stmt = (
            select(LessonPlan.status, func.count(LessonPlan.id))
            .where(
                and_(
                    LessonPlan.school_id == school_id,
                    LessonPlan.deleted_at.is_(None),
                    LessonPlan.class_id.in_(class_ids),
                )
            )
            .group_by(LessonPlan.status)
        )
        return {status: int(count) for status, count in (await session.execute(stmt)).all()}

    @staticmethod
    async def published_exam_ids_for_year(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> list[UUID]:
        stmt = select(Exam.id).where(
            and_(
                Exam.school_id == school_id,
                Exam.academic_year == academic_year,
                Exam.is_published.is_(True),
                Exam.type == END_OF_TERM,
            )
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def class_active_student_ids(
        session: AsyncSession,
        class_id: UUID | str,
        academic_year: str,
    ) -> list[UUID]:
        stmt = (
            select(Student.id)
            .select_from(Enrollment)
            .join(Student, Student.id == Enrollment.student_id)
            .where(
                and_(
                    Enrollment.class_id == class_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ENROLLMENT_ACTIVE,
                    Student.is_active.is_(True),
                )
            )
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def scores_for_class(
        session: AsyncSession,
        student_ids: list[UUID],
        exam_ids: list[UUID],
    ) -> list[Score]:
        """All score rows for the given students on the given exams —
        the caller groups by student to compute per-student aggregates,
        or groups by subject to compute averages."""
        if not student_ids or not exam_ids:
            return []
        stmt = select(Score).where(
            and_(
                Score.student_id.in_(student_ids),
                Score.exam_id.in_(exam_ids),
            )
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def subjects_for_class(
        session: AsyncSession, class_id: UUID | str
    ) -> list[tuple[UUID, str]]:
        """`[(subject_id, name), ...]` for the class."""
        stmt = (
            select(Subject.id, Subject.name)
            .join(ClassSubject, ClassSubject.subject_id == Subject.id)
            .where(ClassSubject.class_id == class_id)
        )
        return [(sid, name) for sid, name in (await session.execute(stmt)).all()]

    @staticmethod
    async def class_by_id(
        session: AsyncSession, school_id: UUID | str, class_id: UUID | str
    ) -> Class | None:
        stmt = select(Class).where(and_(Class.id == class_id, Class.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    # ─── PSC — class rows + staff by division ─────────────────────────

    @staticmethod
    async def year_class_gender_rows(
        session: AsyncSession,
        school_id: UUID | str,
        academic_year: str,
    ) -> list[tuple[Class, int, int, int]]:
        """`[(class, boys, girls, total), ...]` for every class in the
        year. One join + GROUP BY class.id."""
        stmt = (
            select(
                Class,
                func.count().filter(Student.gender == _MALE).label("boys"),
                func.count().filter(Student.gender == _FEMALE).label("girls"),
                func.count().label("total"),
            )
            .join(Enrollment, Enrollment.class_id == Class.id)
            .join(Student, Student.id == Enrollment.student_id)
            .where(
                and_(
                    Class.school_id == school_id,
                    Class.academic_year == academic_year,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ENROLLMENT_ACTIVE,
                    Student.is_active.is_(True),
                )
            )
            .group_by(Class.id)
        )
        return [
            (cls, int(boys or 0), int(girls or 0), int(total or 0))
            for cls, boys, girls, total in (await session.execute(stmt)).all()
        ]

    @staticmethod
    async def active_staff(session: AsyncSession, school_id: UUID | str) -> list[Staff]:
        stmt = select(Staff).where(and_(Staff.school_id == school_id, Staff.is_active.is_(True)))
        return list((await session.execute(stmt)).scalars())


# Re-exports for the service module — the lesson_plan constants aren't
# used directly here, but keeping them local avoids a nested import in
# the service.
LESSON_PLAN_STATUSES: tuple[str, ...] = (
    LP_DRAFT,
    LP_SUBMITTED,
    LP_UNIT_HEAD_APPROVED,
    LP_APPROVED,
    LP_REJECTED,
)

# Role-gate re-export so the router can import roles from one place
# without pulling every domain constant.
_ROLE_ADMIN = ADMIN
_ROLE_TEACHER = TEACHER
