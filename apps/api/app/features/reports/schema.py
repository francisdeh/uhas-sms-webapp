"""Pydantic schemas for the Reports HTTP layer.

All reads. Every shape mirrors the TS-side counterpart in
[apps/web/src/features/reports/types.ts](../../../../web/src/features/reports/types.ts)
one-to-one so the FE view components consume the same fields with no
adapter layer.
"""

from __future__ import annotations

from datetime import date as date_
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.core.school_structure import Division

_CAMEL_CONFIG = ConfigDict(
    alias_generator=lambda name: _to_camel(name),
    populate_by_name=True,
    from_attributes=True,
)


def _to_camel(snake: str) -> str:
    parts = snake.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


# ─── School stats (Admin overview) ──────────────────────────────────────────


class GenderBreakdown(BaseModel):
    model_config = _CAMEL_CONFIG

    male: int
    female: int


class DivisionTotals(BaseModel):
    model_config = _CAMEL_CONFIG

    division: Division
    students: int
    male: int
    female: int
    classes: int
    staff: int


class SchoolTotals(BaseModel):
    model_config = _CAMEL_CONFIG

    students: int
    active_students: int
    inactive_students: int
    staff: int
    active_staff: int
    classes: int
    subjects: int
    parents: int


class LessonPlanCounts(BaseModel):
    model_config = _CAMEL_CONFIG

    draft: int
    submitted: int
    unit_head_approved: int
    approved: int
    rejected: int


class ExamCounts(BaseModel):
    model_config = _CAMEL_CONFIG

    total: int
    published: int


class TodayAttendance(BaseModel):
    """`sessions_recorded` counts today's attendance sessions; `classes`
    is the number of classes in the current year (so a partial-day view
    surfaces the "recorded / total" ratio the FE renders)."""

    model_config = _CAMEL_CONFIG

    sessions_recorded: int
    classes: int


class SchoolStats(BaseModel):
    model_config = _CAMEL_CONFIG

    totals: SchoolTotals
    gender: GenderBreakdown
    divisions: list[DivisionTotals]
    lesson_plans: LessonPlanCounts
    exams: ExamCounts
    today_attendance: TodayAttendance


# ─── Division stats (Deputy dashboard) ──────────────────────────────────────


class AttendanceDay(BaseModel):
    """One day of the last-7 attendance strip. `total` is the number of
    records on that day; `present` counts `present` and `late` (both
    treated as "at school" for the dashboard tile)."""

    model_config = _CAMEL_CONFIG

    date: date_
    present: int
    total: int


class DivisionLessonPlanCounts(BaseModel):
    """Deputy view collapses `unit_head_approved` into `approved` — a
    plan that's cleared the Unit Head step is on its way to Deputy
    review, and the Deputy sees the two together."""

    model_config = _CAMEL_CONFIG

    draft: int
    submitted: int
    approved: int
    rejected: int


class TopClass(BaseModel):
    """One row of the "top classes" table on the Deputy dashboard —
    aggregate is the mean BECE-style aggregate across the class's
    active students; lower is better; `None` when no scores exist for
    the class."""

    model_config = _CAMEL_CONFIG

    class_id: UUID
    class_name: str
    aggregate_avg: float | None = None


class DivisionStats(DivisionTotals):
    model_config = _CAMEL_CONFIG

    attendance_last7: list[AttendanceDay]
    lesson_plans: DivisionLessonPlanCounts
    top_classes: list[TopClass]


# ─── Class stats (Teacher dashboard) ────────────────────────────────────────


class SubjectAverage(BaseModel):
    """One subject's average score for the class. `samples` is the
    number of scores that went into the mean."""

    model_config = _CAMEL_CONFIG

    subject_id: UUID
    subject_name: str
    avg: int
    samples: int


class ClassStats(BaseModel):
    model_config = _CAMEL_CONFIG

    class_id: UUID
    class_name: str
    students: int
    attendance_last7: list[AttendanceDay]
    subject_averages: list[SubjectAverage]


# ─── PSC report (school census-style) ───────────────────────────────────────


class PscClassRow(BaseModel):
    model_config = _CAMEL_CONFIG

    class_id: UUID
    class_name: str
    division: Division
    boys: int
    girls: int
    total: int


class PscStaffEntry(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    name: str
    rank: str
    is_unit_head: bool


class PscDivisionStaff(BaseModel):
    """PSC report groups staff by division. `division` is one of the
    four real divisions or the sentinel `Cross` for un-scoped staff
    (e.g. Admin / Accountant with no `staff.division`)."""

    model_config = _CAMEL_CONFIG

    division: str  # Division | "Cross" — not a strict Literal because
    # the sentinel doesn't belong in the Division union.
    staff: list[PscStaffEntry]


class PscTotals(BaseModel):
    model_config = _CAMEL_CONFIG

    students: int
    boys: int
    girls: int
    leavers: int
    teachers: int
    admins: int


class PscReportData(BaseModel):
    model_config = _CAMEL_CONFIG

    school_name: str
    as_of: date_
    totals: PscTotals
    class_rows: list[PscClassRow]
    staff_by_division: list[PscDivisionStaff]
