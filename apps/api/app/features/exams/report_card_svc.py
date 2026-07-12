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

import logging
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.core.inngest import inngest_client
from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT, TEACHER
from app.core.school_structure import KG
from app.core.security import CurrentUser
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.exams.compute import compute_aggregate
from app.features.exams.constants import BATCH_JOB_COMPLETE, DEFAULT_GRADE_BANDS, BatchJobStatus
from app.features.exams.model import Exam, ReportCardBatchJob
from app.features.exams.report_card_repo import ReportCardBatchJobsRepository, ReportCardRepository
from app.features.exams.schema import (
    ReportCardBatchJobRead,
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
from app.integrations.storage import StorageClient

logger = logging.getLogger(__name__)


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

        scores: list[ReportCardScoreRow] = []
        if cls.division != KG:
            scored = await ReportCardRepository.list_scored_rows(
                session, student_id=student.id, exam_id=exam.id
            )
            class_averages = await ReportCardRepository.class_average_scores(
                session, class_id=cls.id, exam_id=exam.id, academic_year=exam.academic_year
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
                    class_average=class_averages.get(subject.id),
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
            kg_observations=(remark.kg_observations if remark and cls.division == KG else None),
            conduct_ratings=(remark.conduct_ratings if remark else None),
            interests_co_curricular=(remark.interests_co_curricular if remark else None),
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


class ReportCardBatchService:
    """Admin-only — role gate is the router's `RequireAdmin` dep, no
    additional fine-grained check needed (matches `create_exam`/
    `publish_exam`)."""

    @staticmethod
    async def request_batch(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        exam_id: UUID | str,
        class_id: UUID | str,
        requested_by_staff_id: UUID | str,
    ) -> ReportCardBatchJob:
        exam = await ReportCardRepository.load_exam(session, school_id, exam_id)
        if exam is None:
            raise NotFoundError(f"Exam {exam_id!r} not found.")
        cls = await ClassesRepository.get_by_id(session, school_id, class_id)
        if cls is None:
            raise NotFoundError(f"Class {class_id!r} not found.")

        job = await ReportCardBatchJobsRepository.create(
            session,
            school_id=school_id,
            exam_id=exam.id,
            class_id=cls.id,
            requested_by_staff_id=requested_by_staff_id,
        )

        # Best-effort, same rationale as the results-published email
        # emit — the job row already exists in `pending` state, so a
        # broken event bus just leaves it pending rather than losing
        # the request outright.
        try:
            await inngest_client.send(
                inngest.Event(
                    name="reports/report-card.batch.requested",
                    data={
                        "school_id": str(school_id),
                        "exam_id": str(exam.id),
                        "class_id": str(cls.id),
                        "job_id": str(job.id),
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit report-card batch event for job %s", job.id)
            sentry_sdk.capture_exception()

        return job

    @staticmethod
    async def get_status(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        exam_id: UUID | str,
        class_id: UUID | str,
        storage: StorageClient,
    ) -> ReportCardBatchJobRead:
        job = await ReportCardBatchJobsRepository.find_latest(
            session, school_id=school_id, exam_id=exam_id, class_id=class_id
        )
        if job is None:
            raise NotFoundError("No batch print has been requested for this class yet.")

        download_url = None
        if job.status == BATCH_JOB_COMPLETE and job.storage_path:
            download_url = await storage.get_signed_url("documents", job.storage_path)

        status: BatchJobStatus = (
            "complete"
            if job.status == "complete"
            else "failed"
            if job.status == "failed"
            else "pending"
        )
        return ReportCardBatchJobRead(
            id=job.id,
            exam_id=job.exam_id,
            class_id=job.class_id,
            status=status,
            download_url=download_url,
            error_message=job.error_message,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
