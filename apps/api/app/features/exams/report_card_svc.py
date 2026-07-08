"""Business logic for the assembled report card.

Composes the queries in `ReportCardRepository` into a `ReportCardResponse`
+ enforces the role gate. Pure read — the endpoint is idempotent.

Role gate:

  * Admin        — any student in the school.
  * Parent       — must be linked via `student_guardians`, and the exam
                   must be published. Any exam type (MidTerm + EndOfTerm
                   both allowed) once published.
  * Teacher      — must class-teach or subject-teach the student's
                   active-year class.
  * DeputyHead   — student's active class division must match the
                   deputy's `staff.division`.

Not found → 404 (student or exam missing from the school); role miss
→ 403; missing session cookie → 401 (handled by the router dep).
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT, TEACHER
from app.core.security import CurrentUser
from app.features.classes.model import Class
from app.features.exams.compute import compute_aggregate
from app.features.exams.constants import DEFAULT_GRADE_BANDS
from app.features.exams.model import Exam
from app.features.exams.report_card_repo import ReportCardRepository
from app.features.exams.schema import (
    ReportCardExam,
    ReportCardResponse,
    ReportCardSchool,
    ReportCardScoreRow,
    ReportCardStudent,
)
from app.features.schools.repository import SchoolsRepository
from app.features.schools.schema import GradingBand
from app.features.staff.repository import StaffRepository
from app.features.students.model import Student


class ReportCardService:
    @staticmethod
    async def get(
        session: AsyncSession,
        school_id: UUID | str,
        user: CurrentUser,
        *,
        student_id: UUID | str,
        exam_id: UUID | str,
    ) -> ReportCardResponse:
        student = await ReportCardRepository.load_student(session, school_id, student_id)
        if student is None:
            raise NotFoundError(f"Student {student_id!r} not found.")

        exam = await ReportCardRepository.load_exam(session, school_id, exam_id)
        if exam is None:
            raise NotFoundError(f"Exam {exam_id!r} not found.")

        cls = await ReportCardRepository.active_class_for(
            session, student_id=student.id, academic_year=exam.academic_year
        )
        if cls is None:
            raise NotFoundError(
                f"Student {student_id!r} has no active enrollment for {exam.academic_year}."
            )

        await _assert_can_view(session, school_id, user, student, cls, exam)

        scored = await ReportCardRepository.list_scored_rows(
            session, student_id=student.id, exam_id=exam.id
        )
        scores = [
            ReportCardScoreRow(
                subject_id=subject.id,
                subject_slug=subject.slug,
                subject_name=subject.name,
                cat1=score.cat1,
                cat2=score.cat2,
                project_work=score.project_work,
                group_work=score.group_work,
                exam_score=score.exam_score,
                total_score=score.total_score,
                grade=score.grade,
                interpretation=score.interpretation,
                subject_position=score.subject_position,
            )
            for score, subject in scored
        ]
        aggregate = compute_aggregate([row.grade for row in scores])

        teachers = await ReportCardRepository.list_class_teachers(session, class_id=cls.id)
        class_teachers = [f"{t.first_name} {t.last_name}" for t in teachers]

        report = await ReportCardRepository.find_report_submission(
            session, exam_id=exam.id, class_id=cls.id
        )
        remark = await ReportCardRepository.find_student_remark(
            session, exam_id=exam.id, student_id=student.id
        )

        school = await SchoolsRepository.get_by_id(session, school_id)
        if school is None:
            raise NotFoundError(f"School {school_id!r} not found.")

        this_term = await ReportCardRepository.find_term(
            session, school_id=school_id, academic_year=exam.academic_year, term=exam.term
        )
        next_year, next_term = _next_term(exam.academic_year, exam.term)
        following_term = await ReportCardRepository.find_term(
            session, school_id=school_id, academic_year=next_year, term=next_term
        )

        return ReportCardResponse(
            student=ReportCardStudent(
                id=student.id,
                slug=student.slug,
                first_name=student.first_name,
                middle_name=student.middle_name,
                last_name=student.last_name,
                gender=student.gender,
                division=cls.division,
                class_name=cls.name,
            ),
            exam=ReportCardExam(
                id=exam.id,
                name=exam.name,
                type=exam.type,
                term=exam.term,
                academic_year=exam.academic_year,
                is_published=bool(exam.is_published),
            ),
            school=ReportCardSchool(id=school.id, name=school.name, logo_url=school.logo_url),
            scores=scores,
            grading_bands=[
                GradingBand(**band) for band in (school.grading_bands or DEFAULT_GRADE_BANDS)
            ],
            aggregate=aggregate,
            class_teachers=class_teachers,
            class_teacher_remark=(remark.class_teacher_remark if remark else None),
            head_of_school_comment=(report.head_of_school_comment if report else None),
            vacation_date=(this_term.end_date if this_term else None),
            reopening_date=(following_term.start_date if following_term else None),
        )


def _next_term(academic_year: str, term: int) -> tuple[str, int]:
    """The (academic_year, term) that follows this one. Terms 1 and 2 stay
    in the same year; term 3 rolls to term 1 of the next academic year
    (`"2025/2026"` → `"2026/2027"`). Reopening date comes from this term's
    start."""
    if term < 3:
        return academic_year, term + 1
    start, end = academic_year.split("/")
    next_year = f"{int(start) + 1}/{int(end) + 1}"
    return next_year, 1


async def _assert_can_view(
    session: AsyncSession,
    school_id: UUID | str,
    user: CurrentUser,
    student: Student,
    cls: Class,
    exam: Exam,
) -> None:
    role = user.role
    if role == ADMIN:
        return

    if role == PARENT:
        if not user.linked_id:
            raise ForbiddenError("Parent identity missing.")
        linked = await ReportCardRepository.is_parent_of(
            session, guardian_id=user.linked_id, student_id=student.id
        )
        if not linked:
            raise ForbiddenError("You may only view your own children's report cards.")
        if not exam.is_published:
            # Server-side mirror of the frontend's publish gate — a parent
            # hitting the API directly must not see scores before the
            # school publishes them, same as the UI never linking to one.
            raise ForbiddenError("This report card has not been published yet.")
        return

    if role == TEACHER:
        if not user.linked_id:
            raise ForbiddenError("Teacher identity missing.")
        teaches = await ReportCardRepository.teaches_class(
            session, staff_id=user.linked_id, class_id=cls.id
        )
        if not teaches:
            raise ForbiddenError("You may only view students in classes you teach.")
        return

    if role == DEPUTY_HEAD:
        if not user.linked_id:
            raise ForbiddenError("Deputy identity missing.")
        staff = await StaffRepository.get_by_id(session, school_id, user.linked_id)
        if staff is None or staff.division != cls.division:
            raise ForbiddenError("You may only view students in your division.")
        return

    raise ForbiddenError("This role cannot view report cards.")
