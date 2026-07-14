"""Business logic for the Reports domain.

Composes the aggregate queries in `ReportsRepository` into the four
dashboard shapes (`SchoolStats`, `DivisionStats`, `ClassStats`,
`PscReportData`) and enforces per-endpoint role gates.

Role matrix:

  * SchoolStats & PSC — Admin only.
  * DivisionStats — Admin, or DeputyHead whose own division matches.
  * ClassStats — Admin, DeputyHead of the class's division, or any
    teacher/subject teacher assigned to the class.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.core.school_structure import DIVISIONS
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.exams.compute import compute_aggregate
from app.features.exams.model import Score
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
from app.features.reports.repository import ReportsRepository
from app.features.reports.schema import (
    AttendanceDay,
    ClassStats,
    DivisionLessonPlanCounts,
    DivisionStats,
    DivisionTotals,
    ExamCounts,
    GenderBreakdown,
    LessonPlanCounts,
    PscClassRow,
    PscDivisionStaff,
    PscReportData,
    PscStaffEntry,
    PscTotals,
    SchoolStats,
    SchoolTotals,
    SubjectAverage,
    TodayAttendance,
    TopClass,
)
from app.features.schools.service import SchoolsService
from app.features.staff.repository import StaffRepository

# Sentinel division label used in the PSC staff table for staff rows
# with no `staff.division` (typically Admin / Accountant). Mirrors the
# TS-side literal in `get-psc-report.ts`.
_CROSS_DIVISION_SENTINEL = "Cross"

# PSC report header — the report is a Ghana Basic Education census
# format, so the school name is a fixed string in the current TS
# implementation. Keep the literal here rather than reading from the
# schools table so the report title matches the printed original
# byte-for-byte.
_PSC_SCHOOL_NAME = "UHAS Basic School"

# Staff system_role values used in PSC counters. Reference roles from
# constants so a rename in `core/roles.py` propagates here.
_STAFF_ROLE_TEACHER = TEACHER
_STAFF_ROLE_ADMIN = ADMIN


def _today() -> date:
    return datetime.now(UTC).date()


def _last_n_dates(n: int) -> list[date]:
    """Last N dates in ascending order (oldest first) — matches the FE
    strip which shows oldest-to-newest left-to-right."""
    today = _today()
    return [today - timedelta(days=i) for i in range(n - 1, -1, -1)]


class ReportsService:
    # ─── School stats ─────────────────────────────────────────────────

    @staticmethod
    async def get_school_stats(
        session: AsyncSession, school_id: UUID | str, *, actor_role: str
    ) -> SchoolStats:
        if actor_role != ADMIN:
            raise ForbiddenError("Only Admin can view the school report.")

        school = await SchoolsService.get(session, school_id)
        year = school.academic_year

        active_students, inactive_students = await ReportsRepository.student_count_by_active(
            session, school_id
        )
        active_staff, inactive_staff = await ReportsRepository.staff_count_by_active(
            session, school_id
        )
        class_count = await ReportsRepository.class_count(session, school_id, year)
        subject_count = await ReportsRepository.subject_count(session, school_id)
        parent_count = await ReportsRepository.distinct_parent_count(session, school_id)
        male, female = await ReportsRepository.active_student_gender_totals(session, school_id)
        lp_status_counts = await ReportsRepository.lesson_plan_status_counts_for_year(
            session, school_id, year
        )
        exam_total, exam_published = await ReportsRepository.exam_counts_for_year(
            session, school_id, year
        )
        today_sessions = await ReportsRepository.today_session_count(session, school_id, _today())

        divisions = [
            await _division_totals(session, school_id, year, division=d) for d in DIVISIONS
        ]

        return SchoolStats(
            totals=SchoolTotals(
                students=active_students + inactive_students,
                active_students=active_students,
                inactive_students=inactive_students,
                staff=active_staff + inactive_staff,
                active_staff=active_staff,
                classes=class_count,
                subjects=subject_count,
                parents=parent_count,
            ),
            gender=GenderBreakdown(male=male, female=female),
            divisions=divisions,
            lesson_plans=LessonPlanCounts(
                draft=lp_status_counts.get(LP_DRAFT, 0),
                submitted=lp_status_counts.get(LP_SUBMITTED, 0),
                unit_head_approved=lp_status_counts.get(LP_UNIT_HEAD_APPROVED, 0),
                approved=lp_status_counts.get(LP_APPROVED, 0),
                rejected=lp_status_counts.get(LP_REJECTED, 0),
            ),
            exams=ExamCounts(total=exam_total, published=exam_published),
            today_attendance=TodayAttendance(
                sessions_recorded=today_sessions,
                classes=class_count,
            ),
        )

    # ─── Division stats ───────────────────────────────────────────────

    @staticmethod
    async def get_division_stats(
        session: AsyncSession,
        school_id: UUID | str,
        division: str,
        *,
        actor_role: str,
        actor_linked_id: UUID | str | None,
    ) -> DivisionStats:
        await _assert_can_view_division(session, school_id, division, actor_role, actor_linked_id)
        school = await SchoolsService.get(session, school_id)
        year = school.academic_year

        totals = await _division_totals(session, school_id, year, division=division)
        classes = await ReportsRepository.division_classes(session, school_id, year, division)
        class_ids = [c.id for c in classes]

        # Last-7 attendance strip.
        attendance_last7 = [
            _to_attendance_day(
                day, await ReportsRepository.attendance_counts_for_day(session, day, class_ids)
            )
            for day in _last_n_dates(7)
        ]

        # Lesson-plan status counts (Deputy view collapses
        # `unit_head_approved` into `approved` — it's still on the
        # Deputy's queue).
        lp_counts = await ReportsRepository.division_lesson_plans(session, school_id, class_ids)
        lesson_plans = DivisionLessonPlanCounts(
            draft=lp_counts.get(LP_DRAFT, 0),
            submitted=lp_counts.get(LP_SUBMITTED, 0),
            approved=lp_counts.get(LP_APPROVED, 0) + lp_counts.get(LP_UNIT_HEAD_APPROVED, 0),
            rejected=lp_counts.get(LP_REJECTED, 0),
        )

        top_classes = await _compute_top_classes(session, school_id, year, classes)

        return DivisionStats(
            **totals.model_dump(by_alias=False),
            attendance_last7=attendance_last7,
            lesson_plans=lesson_plans,
            top_classes=top_classes,
        )

    # ─── Class stats ──────────────────────────────────────────────────

    @staticmethod
    async def get_class_stats(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        *,
        actor_role: str,
        actor_linked_id: UUID | str | None,
    ) -> ClassStats:
        cls = await ReportsRepository.class_by_id(session, school_id, class_id)
        if cls is None:
            raise NotFoundError(f"Class {class_id!r} not found.")

        await _assert_can_view_class(session, school_id, cls, actor_role, actor_linked_id)
        school = await SchoolsService.get(session, school_id)
        year = school.academic_year

        student_ids = await ReportsRepository.class_active_student_ids(session, cls.id, year)
        published_exam_ids = await ReportsRepository.published_exam_ids_for_year(
            session, school_id, year
        )

        attendance_last7 = [
            _to_attendance_day(
                day, await ReportsRepository.attendance_counts_for_day(session, day, [cls.id])
            )
            for day in _last_n_dates(7)
        ]

        subject_rows = await ReportsRepository.subjects_for_class(session, cls.id)
        scores = await ReportsRepository.scores_for_class(session, student_ids, published_exam_ids)
        scores_by_subject: dict[str, list[int]] = {}
        for s in scores:
            if s.total_score is not None:
                scores_by_subject.setdefault(str(s.subject_id), []).append(s.total_score)

        subject_averages = [
            _subject_average(subject_id, subject_name, scores_by_subject.get(str(subject_id), []))
            for subject_id, subject_name in subject_rows
        ]

        return ClassStats(
            class_id=cls.id,
            class_name=cls.name,
            students=len(student_ids),
            attendance_last7=attendance_last7,
            subject_averages=subject_averages,
        )

    # ─── PSC report ───────────────────────────────────────────────────

    @staticmethod
    async def get_psc_report(
        session: AsyncSession, school_id: UUID | str, *, actor_role: str
    ) -> PscReportData:
        if actor_role != ADMIN:
            raise ForbiddenError("Only Admin can view the PSC report.")

        school = await SchoolsService.get(session, school_id)
        year = school.academic_year

        active_students, inactive_students = await ReportsRepository.student_count_by_active(
            session, school_id
        )
        male, female = await ReportsRepository.active_student_gender_totals(session, school_id)
        year_class_rows = await ReportsRepository.year_class_gender_rows(session, school_id, year)
        active_staff = await ReportsRepository.active_staff(session, school_id)

        class_rows = sorted(
            (
                PscClassRow(
                    class_id=cls.id,
                    class_name=cls.name,
                    division=cls.division,
                    boys=boys,
                    girls=girls,
                    total=total,
                )
                for cls, boys, girls, total in year_class_rows
            ),
            key=lambda r: (_DIVISION_ORDER.get(r.division, 99), r.class_name),
        )

        staff_by_division: list[PscDivisionStaff] = []
        for division in DIVISIONS:
            in_div = [s for s in active_staff if s.division == division]
            staff_by_division.append(
                PscDivisionStaff(
                    division=division,
                    staff=[
                        PscStaffEntry(
                            id=s.id,
                            slug=s.slug,
                            name=f"{s.first_name} {s.last_name}",
                            rank=s.rank or "",
                            is_unit_head=bool(s.is_unit_head),
                        )
                        for s in in_div
                    ],
                )
            )
        cross = [s for s in active_staff if s.division is None]
        staff_by_division.append(
            PscDivisionStaff(
                division=_CROSS_DIVISION_SENTINEL,
                staff=[
                    PscStaffEntry(
                        id=s.id,
                        slug=s.slug,
                        name=f"{s.first_name} {s.last_name}",
                        rank=s.rank or "",
                        is_unit_head=bool(s.is_unit_head),
                    )
                    for s in cross
                ],
            )
        )

        return PscReportData(
            school_name=_PSC_SCHOOL_NAME,
            as_of=_today(),
            totals=PscTotals(
                students=active_students,
                boys=male,
                girls=female,
                leavers=inactive_students,
                teachers=sum(1 for s in active_staff if s.system_role == _STAFF_ROLE_TEACHER),
                admins=sum(1 for s in active_staff if s.system_role == _STAFF_ROLE_ADMIN),
            ),
            class_rows=class_rows,
            staff_by_division=staff_by_division,
        )


# ─── Helpers ────────────────────────────────────────────────────────────────


_DIVISION_ORDER: dict[str, int] = {d: i for i, d in enumerate(DIVISIONS)}


def _to_attendance_day(day: date, counts: tuple[int, int]) -> AttendanceDay:
    present, total = counts
    return AttendanceDay(date=day, present=present, total=total)


def _subject_average(subject_id: UUID, subject_name: str, totals: list[int]) -> SubjectAverage:
    """The FE renders `0` when no valid scores exist — match that
    behaviour rather than returning `None`."""
    samples = len(totals)
    avg = round(sum(totals) / samples) if samples else 0
    return SubjectAverage(
        subject_id=subject_id,
        subject_name=subject_name,
        avg=avg,
        samples=samples,
    )


async def _division_totals(
    session: AsyncSession,
    school_id: UUID | str,
    academic_year: str,
    *,
    division: str,
) -> DivisionTotals:
    total, male, female = await ReportsRepository.division_gender_totals(
        session, school_id, academic_year, division
    )
    classes = await ReportsRepository.division_classes(session, school_id, academic_year, division)
    staff_count = await ReportsRepository.division_staff_count(session, school_id, division)
    return DivisionTotals(
        division=division,
        students=total,
        male=male,
        female=female,
        classes=len(classes),
        staff=staff_count,
    )


async def _compute_top_classes(
    session: AsyncSession,
    school_id: UUID | str,
    academic_year: str,
    classes: list[Class],
) -> list[TopClass]:
    """One row per class with the mean BECE-style aggregate. Lower is
    better; classes with no scores get `None` and sort last."""
    published_exam_ids = await ReportsRepository.published_exam_ids_for_year(
        session, school_id, academic_year
    )
    out: list[TopClass] = []
    for cls in classes:
        student_ids = await ReportsRepository.class_active_student_ids(
            session, cls.id, academic_year
        )
        aggregates = [
            compute_aggregate([s.grade for s in student_scores])
            for student_scores in _group_scores_by_student(
                await ReportsRepository.scores_for_class(session, student_ids, published_exam_ids),
                student_ids,
            )
        ]
        valid = [a for a in aggregates if a is not None]
        avg = sum(valid) / len(valid) if valid else None
        out.append(TopClass(class_id=cls.id, class_name=cls.name, aggregate_avg=avg))
    out.sort(key=lambda r: (r.aggregate_avg is None, r.aggregate_avg or 0.0))
    return out


def _group_scores_by_student(scores: list[Score], student_ids: list[UUID]) -> list[list[Score]]:
    by_student: dict[str, list[Score]] = {}
    for s in scores:
        by_student.setdefault(str(s.student_id), []).append(s)
    return [by_student.get(str(sid), []) for sid in student_ids]


# ─── Role gates ─────────────────────────────────────────────────────────────


async def _assert_can_view_division(
    session: AsyncSession,
    school_id: UUID | str,
    division: str,
    actor_role: str,
    actor_linked_id: UUID | str | None,
) -> None:
    if actor_role == ADMIN:
        return
    if actor_role == DEPUTY_HEAD and actor_linked_id is not None:
        staff = await StaffRepository.get_by_id(session, school_id, actor_linked_id)
        if staff is not None and staff.division == division:
            return
    raise ForbiddenError("You may only view your own division.")


async def _assert_can_view_class(
    session: AsyncSession,
    school_id: UUID | str,
    cls: Class,
    actor_role: str,
    actor_linked_id: UUID | str | None,
) -> None:
    """Admin can view any; Deputy of the class's division can view;
    class teacher or subject teacher assigned to the class can view."""
    if actor_role == ADMIN:
        return
    if actor_role == DEPUTY_HEAD and actor_linked_id is not None:
        staff = await StaffRepository.get_by_id(session, school_id, actor_linked_id)
        if staff is not None and staff.division == cls.division:
            return
    if actor_role == TEACHER and actor_linked_id is not None:
        # Is the caller a class teacher for this class?
        ct_stmt = select(ClassTeacher.class_id).where(
            and_(
                ClassTeacher.class_id == cls.id,
                ClassTeacher.staff_id == actor_linked_id,
            )
        )
        if (await session.execute(ct_stmt)).first() is not None:
            return
        # Or a subject teacher assigned to it?
        cs_stmt = select(ClassSubject.class_id).where(
            and_(
                ClassSubject.class_id == cls.id,
                ClassSubject.teacher_id == actor_linked_id,
            )
        )
        if (await session.execute(cs_stmt)).first() is not None:
            return
    raise ForbiddenError("You may only view classes you teach.")
