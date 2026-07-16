"""Business logic for Exams + Scores.

Score-save flow (`ScoresService.upsert_batch`):

  1. Validate the (exam, class, subject) triple exists in this school.
  2. Validate every studentId in the payload belongs to a current-year
     Active enrolment in that class — cross-school leakage guard.
  3. For each row: compute total (via `compute.compute_total` with the
     school's configured weights), compute grade (via
     `compute.compute_grade` with school's bands), upsert.
  4. For every row we touched, recompute positions across the whole
     (exam, subject, class) group — a save can change rankings even
     for students not in the payload.
  5. If the exam is published, write one `SCORE_OVERRIDE` audit row
     capturing the per-cell before/after diff.

Everything happens in the caller's transaction.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.inngest import inngest_client
from app.core.security import CurrentUser
from app.features.audit.actions import EXAM_PUBLISH, EXAM_UNPUBLISH, SCORE_OVERRIDE
from app.features.audit.service import write_audit_log
from app.features.classes.repository import ClassesRepository
from app.features.classes.service import ClassesService
from app.features.exams.compute import (
    ComponentScores,
    assign_positions,
    compute_grade,
    compute_total,
)
from app.features.exams.constants import (
    DEFAULT_GRADE_BANDS,
    DEFAULT_SCORE_WEIGHTS,
)
from app.features.exams.model import Exam, Score
from app.features.exams.repository import ExamsRepository, ScoresRepository
from app.features.exams.schema import ExamCreate, ExamUpdate, ScoresUpsertRequest
from app.features.notifications.constants import RESULTS_PUBLISHED
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schools.model import School
from app.features.schools.repository import SchoolsRepository
from app.features.subjects.repository import SubjectsRepository
from app.features.users.model import UserPreferences

logger = logging.getLogger(__name__)


async def _school(session: AsyncSession, school_id: UUID | str) -> School:
    """Fetch school row or 404 — used to read weights/bands/AY."""
    school = await SchoolsRepository.get_by_id(session, school_id)
    if not school:
        raise NotFoundError(f"School {school_id!r} not found.")
    return school


def _score_component_fields(score: Score) -> dict[str, Any]:
    """Snapshot of the writable component fields — used for audit diffs.

    Includes materialised `totalScore` + `grade` so the audit row
    captures both the input the teacher edited and the derived output
    that changed as a result.
    """
    return {
        "cat1": score.cat1,
        "cat2": score.cat2,
        "projectWork": score.project_work,
        "groupWork": score.group_work,
        "examScore": score.exam_score,
        "totalScore": score.total_score,
        "grade": score.grade,
    }


class ExamsService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        academic_year: str | None = None,
        term: int | None = None,
        exam_type: str | None = None,
        published: bool | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[Exam], int]:
        return await ExamsRepository.list_for_school(
            session,
            school_id,
            q=q,
            academic_year=academic_year,
            term=term,
            exam_type=exam_type,
            published=published,
            page=page,
            size=size,
        )

    @staticmethod
    async def get(session: AsyncSession, school_id: UUID | str, exam_id: UUID | str) -> Exam:
        row = await ExamsRepository.get_by_id(session, school_id, exam_id)
        if not row:
            raise NotFoundError(f"Exam {exam_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: ExamCreate,
    ) -> Exam:
        existing = await ExamsRepository.find_by_natural_key(
            session,
            school_id,
            name=payload.name,
            academic_year=payload.academic_year,
            term=payload.term,
            exam_type=payload.type,
        )
        if existing:
            raise ConflictError(
                f"Exam {payload.name!r} already exists "
                f"for {payload.academic_year} term {payload.term}."
            )
        row = Exam(
            school_id=school_id,
            name=payload.name,
            type=payload.type,
            term=payload.term,
            academic_year=payload.academic_year,
            is_published=False,
        )
        session.add(row)
        await session.flush()
        return row

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        exam_id: UUID | str,
        payload: ExamUpdate,
    ) -> Exam:
        row = await ExamsService.get(session, school_id, exam_id)
        if row.is_published:
            raise ConflictError(
                "Cannot edit a published exam. Unpublish first if metadata needs correcting."
            )
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        await session.flush()
        return row

    @staticmethod
    async def set_published(
        session: AsyncSession,
        school_id: UUID | str,
        exam_id: UUID | str,
        *,
        publish: bool,
        actor_user_id: UUID | str,
    ) -> Exam:
        row = await ExamsService.get(session, school_id, exam_id)
        if bool(row.is_published) == publish:
            raise ConflictError(f"Exam is already {'published' if publish else 'unpublished'}.")
        row.is_published = publish
        # `published_at` is TIMESTAMP WITHOUT TIME ZONE; strip tz so
        # asyncpg doesn't error on tz-aware ↔ tz-naive conversion.
        row.published_at = datetime.now(UTC).replace(tzinfo=None) if publish else None
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=EXAM_PUBLISH if publish else EXAM_UNPUBLISH,
            target_table="exams",
            target_id=row.id,
            before={"isPublished": not publish},
            after={"isPublished": publish},
        )
        await session.flush()

        if publish:
            await _notify_results_published(session, school_id, row)

        return row


class ScoresService:
    @staticmethod
    async def get_grid(
        session: AsyncSession,
        school_id: UUID | str,
        user: CurrentUser,
        *,
        exam_id: UUID | str,
        class_id: UUID | str,
        subject_id: UUID | str,
    ) -> list[tuple[Any, Any, Score | None]]:
        """Rows for the (exam, class, subject) grid — one per student.

        Role gate: same as `upsert_batch` — see
        `ClassesService.assert_can_access_class`.
        """
        await ExamsService.get(session, school_id, exam_id)
        cls = await ClassesRepository.get_by_id(session, school_id, class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")
        await ClassesService.assert_can_access_class(session, school_id, user, cls)
        return await ScoresRepository.list_grid(
            session,
            exam_id=exam_id,
            class_id=class_id,
            subject_id=subject_id,
            academic_year=cls.academic_year,
        )

    @staticmethod
    async def upsert_batch(
        session: AsyncSession,
        school_id: UUID | str,
        exam_id: UUID | str,
        payload: ScoresUpsertRequest,
        user: CurrentUser,
        *,
        actor_user_id: UUID | str,
    ) -> list[Score]:
        exam = await ExamsService.get(session, school_id, exam_id)
        school = await _school(session, school_id)
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")
        await ClassesService.assert_can_access_class(session, school_id, user, cls)
        subject = await SubjectsRepository.get_by_id(session, school_id, payload.subject_id)
        if not subject:
            raise ValidationError("Subject not found in this school.")

        # Roster guard — every studentId must be an active enrolment.
        payload_student_ids = [r.student_id for r in payload.records]
        enrolled = await ScoresRepository.enrollments_for_students(
            session,
            class_id=payload.class_id,
            academic_year=cls.academic_year,
            student_ids=payload_student_ids,
        )
        stray = set(payload_student_ids) - enrolled
        if stray:
            raise ValidationError(
                f"{len(stray)} record(s) reference students not enrolled in this class."
            )

        weights = school.score_weights or DEFAULT_SCORE_WEIGHTS
        bands = school.grading_bands or DEFAULT_GRADE_BANDS
        was_published = bool(exam.is_published)

        # Snapshot before-state per row, keyed by student_id, for audit + diff.
        before_by_student: dict[UUID, dict[str, int | None]] = {}
        after_by_student: dict[UUID, dict[str, int | None]] = {}

        for record in payload.records:
            row = await ScoresRepository.find_row(
                session,
                exam_id=exam_id,
                student_id=record.student_id,
                subject_id=payload.subject_id,
            )
            comps = ComponentScores(
                cat1=record.cat1,
                cat2=record.cat2,
                project_work=record.project_work,
                group_work=record.group_work,
                exam_score=record.exam_score,
            )
            total = compute_total(exam.type, comps, weights=weights)  # type: ignore[arg-type]
            grade_val, interpretation = ("", "")
            if total is not None:
                grade_val, interpretation = compute_grade(total, bands=bands)

            if row is None:
                row = Score(
                    exam_id=exam_id,
                    student_id=record.student_id,
                    subject_id=payload.subject_id,
                )
                session.add(row)
            elif was_published:
                before_by_student[record.student_id] = _score_component_fields(row)

            row.cat1 = record.cat1
            row.cat2 = record.cat2
            row.project_work = record.project_work
            row.group_work = record.group_work
            row.exam_score = record.exam_score
            row.total_score = total
            row.grade = grade_val or None
            row.interpretation = interpretation or None
            row.updated_at = datetime.now(UTC).replace(tzinfo=None)
            after_by_student[record.student_id] = _score_component_fields(row)

        await session.flush()

        # Rerank the whole (exam, subject, class) group. This includes
        # students who weren't in the payload — their positions can
        # shift when someone else's total changes.
        roster = await ScoresRepository.list_class_roster(
            session, payload.class_id, cls.academic_year
        )
        roster_ids = [s.id for s in roster]
        group_scores = await ScoresRepository.list_for_ranking(
            session,
            exam_id=exam_id,
            subject_id=payload.subject_id,
            student_ids=roster_ids,
        )
        totals: list[tuple[UUID, int | None]] = [
            (sc.student_id, sc.total_score) for sc in group_scores
        ]
        positions = assign_positions(totals)
        for sc in group_scores:
            sc.subject_position = positions.get(sc.student_id)

        # Audit — only fires for published exams; edits to draft exams
        # don't leave a trail (that's the whole point of "draft").
        if was_published and before_by_student:
            await write_audit_log(
                session,
                school_id=school_id,
                user_id=actor_user_id,
                action=SCORE_OVERRIDE,
                target_table="scores",
                target_id=exam.id,
                before={"records": {str(k): v for k, v in before_by_student.items()}},
                after={
                    "records": {
                        str(k): v for k, v in after_by_student.items() if k in before_by_student
                    }
                },
            )

        await session.flush()
        return group_scores


async def _notify_results_published(
    session: AsyncSession, school_id: UUID | str, exam: Exam
) -> None:
    """Fires on `ExamsService.set_published(publish=True)`. Two channels:

      * In-app `RESULTS_PUBLISHED` notification, one per published
        child — written in this same transaction (cheap, no network
        I/O), so it's never lost even if the email side fails.
      * `email/results-published.requested`, one event per guardian
        (not per child) so a guardian with several children in this
        exam gets one email listing all of them, not several. Fully
        resolved here (recipient email + child names) so the job itself
        is a pure "send what I'm told" handler — same division of
        labour as `lesson_plans/jobs/rejection_email.py`.

    Gated by the school's `notification_defaults.on_results_published`
    toggle (checked once) and each guardian's own
    `user_preferences.email_on_results_published` (checked per
    recipient) — same two-tier gate as the lesson-plan-rejection email.
    A guardian with no linked app user is skipped entirely (nobody to
    notify); a guardian with an app user but no email only gets the
    in-app notification.
    """
    recipients = await ExamsRepository.list_published_recipients(
        session, school_id=school_id, exam_id=exam.id
    )
    if not recipients:
        return

    school = await SchoolsRepository.get_by_id(session, school_id)
    defaults = (school.notification_defaults if school else None) or {}
    email_enabled = bool(defaults.get("on_results_published", True))
    school_name = school.name if school else "UHAS SMS"
    school_address = (school.address if school else None) or ""
    school_contact_email = (school.email if school else None) or ""

    by_guardian_user: dict[UUID, tuple[str | None, list[str]]] = {}
    for student, _guardian, user in recipients:
        if user is None:
            continue
        student_name = f"{student.first_name} {student.last_name}"
        await NotificationsService.notify_user(
            session,
            school_id,
            user_id=user.id,
            payload=NotifyPayload(
                kind=RESULTS_PUBLISHED,
                title="Results published",
                body=f"{student_name}'s results for {exam.name} are ready.",
                link="/parent/results",
            ),
        )
        email, names = by_guardian_user.get(user.id, (user.email, []))
        names.append(f"{student.first_name} {student.last_name}")
        by_guardian_user[user.id] = (email, names)

    if not email_enabled:
        return

    for user_id, (email, child_names) in by_guardian_user.items():
        if not email:
            continue
        prefs = await session.scalar(
            select(UserPreferences).where(UserPreferences.user_id == user_id)
        )
        if prefs is not None and not prefs.email_on_results_published:
            continue
        try:
            await inngest_client.send(
                inngest.Event(
                    name="email/results-published.requested",
                    data={
                        "guardian_email": email,
                        "exam_name": exam.name,
                        "child_names": child_names,
                        "link": "/parent/results",
                        "school_name": school_name,
                        "school_address": school_address,
                        "school_contact_email": school_contact_email,
                        "preferences_link": "/parent/profile?tab=notifications",
                    },
                )
            )
        except Exception:
            logger.exception(
                "Failed to emit results-published email event for exam %s, guardian user %s",
                exam.id,
                user_id,
            )
            sentry_sdk.capture_exception()
