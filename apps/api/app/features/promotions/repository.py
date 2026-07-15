"""Data-access for the Promotions domain.

The queries fall into three groups:

  1. Season — one row per (school, academic_year). Simple lookups.

  2. Submissions + decisions — the bulk of the code. Read paths join
     enough joined display data (student name, class teachers, next-year
     class options) to fill the detail page in one round trip. Write
     paths batch decision inserts/updates so a single class refresh is
     one INSERT and one UPDATE, not N.

  3. Overview / queue projections — grouped counts across all classes
     for the Admin overview + Deputy-Head queue. These are aggregate
     reads that would be painful to compose from the finer-grained ones.

The transactional `approve` step is NOT in this module — it belongs in
the service because it mutates cross-domain tables (`enrollments`,
`students`) and needs to hold one session for the whole thing.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, asc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.exams.constants import END_OF_TERM
from app.features.exams.model import Exam, Score
from app.features.promotions.constants import (
    ENROLLMENT_ACTIVE,
    SEASON_OPEN,
    SUB_APPROVED,
    SUB_DRAFT,
    SUB_SENT_BACK,
    SUB_SUBMITTED,
)
from app.features.promotions.model import (
    PromotionComment,
    PromotionDecision,
    PromotionSeason,
    PromotionSubmission,
)
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.features.subjects.constants import CORE
from app.features.subjects.model import Subject


class PromotionsRepository:
    # ─── Season ─────────────────────────────────────────────────────────

    @staticmethod
    async def find_season(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> PromotionSeason | None:
        stmt = select(PromotionSeason).where(
            and_(
                PromotionSeason.school_id == school_id,
                PromotionSeason.academic_year == academic_year,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_open_season(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> PromotionSeason | None:
        stmt = select(PromotionSeason).where(
            and_(
                PromotionSeason.school_id == school_id,
                PromotionSeason.academic_year == academic_year,
                PromotionSeason.status == SEASON_OPEN,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def has_published_term3_end_of_term(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> bool:
        stmt = select(Exam.id).where(
            and_(
                Exam.school_id == school_id,
                Exam.academic_year == academic_year,
                Exam.term == 3,
                Exam.type == END_OF_TERM,
                Exam.is_published.is_(True),
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none() is not None

    @staticmethod
    async def get_term3_exam(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> Exam | None:
        stmt = select(Exam).where(
            and_(
                Exam.school_id == school_id,
                Exam.academic_year == academic_year,
                Exam.term == 3,
                Exam.type == END_OF_TERM,
                Exam.is_published.is_(True),
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    # ─── Submission ────────────────────────────────────────────────────

    @staticmethod
    async def find_submission_by_class(
        session: AsyncSession,
        school_id: UUID | str,
        class_id: UUID | str,
        academic_year: str,
    ) -> PromotionSubmission | None:
        stmt = select(PromotionSubmission).where(
            and_(
                PromotionSubmission.school_id == school_id,
                PromotionSubmission.class_id == class_id,
                PromotionSubmission.academic_year == academic_year,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_submission_by_id(
        session: AsyncSession,
        school_id: UUID | str,
        submission_id: UUID | str,
    ) -> PromotionSubmission | None:
        """Tenant-scoped fetch. Returns `None` if the row exists but
        belongs to another school — treated the same as "not found" so
        we don't leak the row's existence."""
        stmt = select(PromotionSubmission).where(
            and_(
                PromotionSubmission.id == submission_id,
                PromotionSubmission.school_id == school_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def list_submissions_for_school(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> list[PromotionSubmission]:
        stmt = select(PromotionSubmission).where(
            and_(
                PromotionSubmission.school_id == school_id,
                PromotionSubmission.academic_year == academic_year,
            )
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def list_submissions_for_classes(
        session: AsyncSession,
        class_ids: Iterable[UUID | str],
        academic_year: str,
    ) -> list[PromotionSubmission]:
        ids = list(class_ids)
        if not ids:
            return []
        stmt = select(PromotionSubmission).where(
            and_(
                PromotionSubmission.academic_year == academic_year,
                PromotionSubmission.class_id.in_(ids),
            )
        )
        return list((await session.execute(stmt)).scalars())

    # ─── Decisions ─────────────────────────────────────────────────────

    @staticmethod
    async def list_decisions_for_submission(
        session: AsyncSession, submission_id: UUID | str
    ) -> list[PromotionDecision]:
        stmt = select(PromotionDecision).where(PromotionDecision.submission_id == submission_id)
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def decision_count_by_submission(
        session: AsyncSession, submission_ids: Iterable[UUID | str]
    ) -> dict[str, int]:
        ids = list(submission_ids)
        if not ids:
            return {}
        stmt = (
            select(
                PromotionDecision.submission_id,
                func.count(PromotionDecision.id).label("cnt"),
            )
            .where(PromotionDecision.submission_id.in_(ids))
            .group_by(PromotionDecision.submission_id)
        )
        rows = (await session.execute(stmt)).all()
        return {str(sid): int(cnt) for sid, cnt in rows}

    @staticmethod
    async def existing_student_ids_for_submission(
        session: AsyncSession, submission_id: UUID | str
    ) -> set[str]:
        """Used by `ensure_submission` — skip re-inserting rows for
        students who already have a decision."""
        stmt = select(PromotionDecision.student_id).where(
            PromotionDecision.submission_id == submission_id
        )
        return {str(r) for r in (await session.execute(stmt)).scalars()}

    # ─── Roster / classes / subjects ───────────────────────────────────

    @staticmethod
    async def active_students_in_class(
        session: AsyncSession,
        class_id: UUID | str,
        academic_year: str,
    ) -> list[Student]:
        stmt = (
            select(Student)
            .join(Enrollment, Enrollment.student_id == Student.id)
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
    async def core_subjects_for_division(
        session: AsyncSession, school_id: UUID | str, division: str
    ) -> list[Subject]:
        stmt = select(Subject).where(
            and_(
                Subject.school_id == school_id,
                Subject.division == division,
                Subject.category == CORE,
            )
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def next_year_classes_for_division(
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
    async def classes_for_school_year(
        session: AsyncSession, school_id: UUID | str, academic_year: str
    ) -> list[Class]:
        stmt = (
            select(Class)
            .where(
                and_(
                    Class.school_id == school_id,
                    Class.academic_year == academic_year,
                )
            )
            .order_by(asc(Class.name))
        )
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def classes_for_teacher(
        session: AsyncSession,
        school_id: UUID | str,
        teacher_staff_id: UUID | str,
        academic_year: str,
    ) -> list[tuple[Class, bool]]:
        """Returns (class, is_primary) for each class the staff member
        is assigned to for the given academic year."""
        stmt = (
            select(Class, ClassTeacher.is_primary)
            .join(ClassTeacher, ClassTeacher.class_id == Class.id)
            .where(
                and_(
                    Class.school_id == school_id,
                    Class.academic_year == academic_year,
                    ClassTeacher.staff_id == teacher_staff_id,
                )
            )
        )
        return [(cls, bool(is_primary)) for cls, is_primary in (await session.execute(stmt)).all()]

    @staticmethod
    async def scores_for_student_in_exam(
        session: AsyncSession, exam_id: UUID | str, student_id: UUID | str
    ) -> list[Score]:
        stmt = select(Score).where(and_(Score.exam_id == exam_id, Score.student_id == student_id))
        return list((await session.execute(stmt)).scalars())

    # ─── Cross-table joins used by the projection endpoints ─────────────

    @staticmethod
    async def class_teachers_by_class(
        session: AsyncSession, class_ids: Iterable[UUID | str]
    ) -> dict[str, list[tuple[Staff, bool]]]:
        """`{class_id_str: [(staff, is_primary), ...]}` — used by both
        the overview and detail projections."""
        ids = list(class_ids)
        if not ids:
            return {}
        stmt = (
            select(ClassTeacher.class_id, Staff, ClassTeacher.is_primary)
            .join(Staff, Staff.id == ClassTeacher.staff_id)
            .where(ClassTeacher.class_id.in_(ids))
        )
        result: dict[str, list[tuple[Staff, bool]]] = {}
        for class_id, staff, is_primary in (await session.execute(stmt)).all():
            result.setdefault(str(class_id), []).append((staff, bool(is_primary)))
        return result

    @staticmethod
    async def active_enrollment_count_by_class(
        session: AsyncSession, academic_year: str, class_ids: Iterable[UUID | str]
    ) -> dict[str, int]:
        ids = list(class_ids)
        if not ids:
            return {}
        stmt = (
            select(Enrollment.class_id, func.count(Enrollment.student_id))
            .where(
                and_(
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ENROLLMENT_ACTIVE,
                    Enrollment.class_id.in_(ids),
                )
            )
            .group_by(Enrollment.class_id)
        )
        return {str(cid): int(cnt) for cid, cnt in (await session.execute(stmt)).all()}

    @staticmethod
    async def students_by_ids(
        session: AsyncSession, student_ids: Iterable[UUID | str]
    ) -> dict[str, Student]:
        ids = list(student_ids)
        if not ids:
            return {}
        stmt = select(Student).where(Student.id.in_(ids))
        return {str(s.id): s for s in (await session.execute(stmt)).scalars()}

    @staticmethod
    async def staff_by_ids(
        session: AsyncSession, staff_ids: Iterable[UUID | str | None]
    ) -> dict[str, Staff]:
        ids = [s for s in staff_ids if s is not None]
        if not ids:
            return {}
        stmt = select(Staff).where(Staff.id.in_(ids))
        return {str(s.id): s for s in (await session.execute(stmt)).scalars()}

    # ─── Sort helper for DH queue ──────────────────────────────────────

    @staticmethod
    def sort_submissions_for_dh_queue(
        rows: list[tuple[PromotionSubmission, Class, list[str]]],
    ) -> list[tuple[PromotionSubmission, Class, list[str]]]:
        """DH queue orders by status precedence (submitted → sent_back →
        approved → draft) then class name.

        Kept here because the ordering rule matches the DB more naturally
        than any generic sort — future work: push into SQL via a CASE."""
        order = {
            SUB_SUBMITTED: 0,
            SUB_SENT_BACK: 1,
            SUB_APPROVED: 2,
            SUB_DRAFT: 3,
        }
        return sorted(
            rows,
            key=lambda r: (order.get(r[0].status, 99), r[1].name),
        )

    # ─── Comment thread ─────────────────────────────────────────────────

    @staticmethod
    async def insert_comment(
        session: AsyncSession,
        *,
        submission_id: UUID | str,
        author_id: UUID | str,
        body: str,
    ) -> PromotionComment:
        comment = PromotionComment(submission_id=submission_id, author_id=author_id, body=body)
        session.add(comment)
        await session.flush()
        return comment

    @staticmethod
    async def list_comments_for_submission(
        session: AsyncSession, submission_id: UUID | str
    ) -> list[tuple[PromotionComment, Staff]]:
        stmt = (
            select(PromotionComment, Staff)
            .join(Staff, Staff.id == PromotionComment.author_id)
            .where(PromotionComment.submission_id == submission_id)
            .order_by(PromotionComment.created_at.asc())
        )
        return [(c, s) for c, s in (await session.execute(stmt)).all()]

    # ─── Weekly reminder job ────────────────────────────────────────────

    @staticmethod
    async def classes_needing_reminder(
        session: AsyncSession,
        school_id: UUID | str,
        academic_year: str,
        *,
        remind_again_after: datetime,
    ) -> list[tuple[Class, PromotionSubmission | None]]:
        """Every current-year class whose promotion list isn't yet
        submitted/approved, and hasn't been reminded within the cooldown
        window. LEFT JOIN so classes with no submission row at all (the
        teacher never opened the page) are included too."""
        stmt = (
            select(Class, PromotionSubmission)
            .outerjoin(
                PromotionSubmission,
                and_(
                    PromotionSubmission.class_id == Class.id,
                    PromotionSubmission.academic_year == academic_year,
                ),
            )
            .where(
                and_(
                    Class.school_id == school_id,
                    Class.academic_year == academic_year,
                    or_(
                        PromotionSubmission.id.is_(None),
                        and_(
                            PromotionSubmission.status.notin_([SUB_SUBMITTED, SUB_APPROVED]),
                            or_(
                                PromotionSubmission.last_reminder_sent_at.is_(None),
                                PromotionSubmission.last_reminder_sent_at < remind_again_after,
                            ),
                        ),
                    ),
                )
            )
        )
        return [(cls, sub) for cls, sub in (await session.execute(stmt)).all()]
