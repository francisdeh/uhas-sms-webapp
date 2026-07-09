"""Data-access layer for Fees."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import and_, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE as ENROLLMENT_ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.fees.constants import OUTSTANDING, PARTIAL
from app.features.fees.model import FeeItem, FeePayment, LearnerFee
from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian


class FeesRepository:
    # ── fee_items ────────────────────────────────────────────────────────

    @staticmethod
    async def insert_fee_item(session: AsyncSession, item: FeeItem) -> FeeItem:
        session.add(item)
        await session.flush()
        return item

    @staticmethod
    async def get_fee_item_by_id(
        session: AsyncSession, school_id: UUID | str, fee_item_id: UUID | str
    ) -> FeeItem | None:
        stmt = select(FeeItem).where(
            and_(FeeItem.id == fee_item_id, FeeItem.school_id == school_id)
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def list_fee_items(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        academic_year: str | None = None,
        term: int | None = None,
        is_active: bool | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[FeeItem], int]:
        where = [FeeItem.school_id == school_id]
        if academic_year:
            where.append(FeeItem.academic_year == academic_year)
        if term is not None:
            where.append(FeeItem.term == term)
        if is_active is not None:
            where.append(FeeItem.is_active == is_active)
        where_clause = and_(*where)

        total = int(
            (await session.execute(select(func.count(FeeItem.id)).where(where_clause))).scalar_one()
            or 0
        )
        offset = (page - 1) * size
        stmt = (
            select(FeeItem)
            .where(where_clause)
            .order_by(desc(FeeItem.created_at))
            .offset(offset)
            .limit(size)
        )
        items = list((await session.execute(stmt)).scalars().all())
        return items, total

    # ── roster resolution ───────────────────────────────────────────────

    @staticmethod
    async def active_students_in_scope(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        scope: str,
        scope_ref: str | None,
        academic_year: str,
    ) -> list[Student]:
        """Every actively-enrolled student a fee item's scope covers.

        `scope="class"` filters enrollments to one class; `"division"`
        filters to every class in that division; `"school"` takes every
        active enrollment in the school. Mirrors
        `notifications/audience.py`'s `_student_ids_in_class` /
        `_student_ids_in_division`, kept local to this feature rather
        than imported since it returns full `Student` rows (needed for
        display), not just ids."""
        class_ids: list[UUID] | None = None
        if scope == "class":
            class_ids = [UUID(str(scope_ref))]
        elif scope == "division":
            class_ids = list(
                (
                    await session.execute(
                        select(Class.id).where(
                            and_(Class.school_id == school_id, Class.division == scope_ref)
                        )
                    )
                ).scalars()
            )
            if not class_ids:
                return []

        enrollment_where = [
            Enrollment.academic_year == academic_year,
            Enrollment.status == ENROLLMENT_ACTIVE,
        ]
        if class_ids is not None:
            enrollment_where.append(Enrollment.class_id.in_(class_ids))
        else:
            # scope == "school": every class in the school this year.
            school_class_ids = select(Class.id).where(
                and_(Class.school_id == school_id, Class.academic_year == academic_year)
            )
            enrollment_where.append(Enrollment.class_id.in_(school_class_ids))

        stmt = (
            select(Student)
            .join(Enrollment, Enrollment.student_id == Student.id)
            .where(and_(*enrollment_where))
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def existing_student_ids_for_fee_item(
        session: AsyncSession, fee_item_id: UUID | str
    ) -> set[str]:
        """Students who already have a (non-deleted) `learner_fees` row
        for this fee item — assignment skips them rather than erroring,
        so re-running "Assign" after enrolling new students is safe."""
        stmt = select(LearnerFee.student_id).where(
            and_(LearnerFee.fee_item_id == fee_item_id, LearnerFee.deleted_at.is_(None))
        )
        return {str(sid) for sid in (await session.execute(stmt)).scalars()}

    @staticmethod
    async def insert_learner_fees(
        session: AsyncSession, rows: list[LearnerFee]
    ) -> list[LearnerFee]:
        session.add_all(rows)
        await session.flush()
        return rows

    # ── learner_fees ─────────────────────────────────────────────────────

    @staticmethod
    async def get_learner_fee_by_id(
        session: AsyncSession, school_id: UUID | str, learner_fee_id: UUID | str
    ) -> tuple[LearnerFee, Student, FeeItem] | None:
        stmt = (
            select(LearnerFee, Student, FeeItem)
            .join(Student, Student.id == LearnerFee.student_id)
            .join(FeeItem, FeeItem.id == LearnerFee.fee_item_id)
            .where(
                and_(
                    LearnerFee.id == learner_fee_id,
                    LearnerFee.school_id == school_id,
                    LearnerFee.deleted_at.is_(None),
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1], row[2]) if row else None

    @staticmethod
    async def list_learner_fees_for_fee_item(
        session: AsyncSession, fee_item_id: UUID | str
    ) -> list[tuple[LearnerFee, Student, FeeItem]]:
        stmt = (
            select(LearnerFee, Student, FeeItem)
            .join(Student, Student.id == LearnerFee.student_id)
            .join(FeeItem, FeeItem.id == LearnerFee.fee_item_id)
            .where(and_(LearnerFee.fee_item_id == fee_item_id, LearnerFee.deleted_at.is_(None)))
            .order_by(asc(Student.last_name), asc(Student.first_name))
        )
        return [(lf, st, fi) for lf, st, fi in (await session.execute(stmt)).all()]

    @staticmethod
    async def list_learner_fees_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        status: str | None = None,
        student_id: UUID | str | None = None,
        fee_item_id: UUID | str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[LearnerFee, Student, FeeItem]], int]:
        where = [LearnerFee.school_id == school_id, LearnerFee.deleted_at.is_(None)]
        if status:
            where.append(LearnerFee.status == status)
        if student_id:
            where.append(LearnerFee.student_id == student_id)
        if fee_item_id:
            where.append(LearnerFee.fee_item_id == fee_item_id)
        where_clause = and_(*where)

        total = int(
            (
                await session.execute(select(func.count(LearnerFee.id)).where(where_clause))
            ).scalar_one()
            or 0
        )
        offset = (page - 1) * size
        stmt = (
            select(LearnerFee, Student, FeeItem)
            .join(Student, Student.id == LearnerFee.student_id)
            .join(FeeItem, FeeItem.id == LearnerFee.fee_item_id)
            .where(where_clause)
            .order_by(desc(LearnerFee.updated_at))
            .offset(offset)
            .limit(size)
        )
        rows = [(lf, st, fi) for lf, st, fi in (await session.execute(stmt)).all()]
        return rows, total

    @staticmethod
    async def list_learner_fees_for_students(
        session: AsyncSession,
        school_id: UUID | str,
        student_ids: Sequence[UUID | str],
    ) -> list[tuple[LearnerFee, Student, FeeItem]]:
        """Every non-deleted `learner_fees` row for an explicit set of
        students — the parent-facing query. Deliberately separate from
        `list_learner_fees_for_school` (which scans the whole school)
        so a parent-facing caller can never accidentally see another
        family's fees by omitting a filter."""
        if not student_ids:
            return []
        stmt = (
            select(LearnerFee, Student, FeeItem)
            .join(Student, Student.id == LearnerFee.student_id)
            .join(FeeItem, FeeItem.id == LearnerFee.fee_item_id)
            .where(
                and_(
                    LearnerFee.school_id == school_id,
                    LearnerFee.deleted_at.is_(None),
                    LearnerFee.student_id.in_(student_ids),
                )
            )
            .order_by(asc(Student.last_name), asc(Student.first_name), asc(LearnerFee.created_at))
        )
        return [(lf, st, fi) for lf, st, fi in (await session.execute(stmt)).all()]

    @staticmethod
    async def soft_delete_learner_fee(
        session: AsyncSession, row: LearnerFee, *, when: datetime
    ) -> None:
        row.deleted_at = when
        await session.flush()

    # ── fee_payments ─────────────────────────────────────────────────────

    @staticmethod
    async def insert_payment(session: AsyncSession, payment: FeePayment) -> FeePayment:
        session.add(payment)
        await session.flush()
        return payment

    @staticmethod
    async def list_payments_for_learner_fee(
        session: AsyncSession, learner_fee_id: UUID | str
    ) -> list[tuple[FeePayment, Staff]]:
        stmt = (
            select(FeePayment, Staff)
            .join(Staff, Staff.id == FeePayment.recorded_by_id)
            .where(FeePayment.learner_fee_id == learner_fee_id)
            .order_by(asc(FeePayment.paid_at))
        )
        return [(p, s) for p, s in (await session.execute(stmt)).all()]

    @staticmethod
    async def list_payments_for_learner_fees(
        session: AsyncSession, learner_fee_ids: Sequence[UUID | str]
    ) -> list[FeePayment]:
        """Batch variant of `list_payments_for_learner_fee`, no `Staff`
        join — the parent-facing caller doesn't need who recorded it."""
        if not learner_fee_ids:
            return []
        stmt = (
            select(FeePayment)
            .where(FeePayment.learner_fee_id.in_(learner_fee_ids))
            .order_by(asc(FeePayment.paid_at))
        )
        return list((await session.execute(stmt)).scalars().all())

    @staticmethod
    async def sum_paid_for_learner_fee(session: AsyncSession, learner_fee_id: UUID | str) -> int:
        stmt = select(func.coalesce(func.sum(FeePayment.amount_minor), 0)).where(
            FeePayment.learner_fee_id == learner_fee_id
        )
        return int((await session.execute(stmt)).scalar_one())

    # ── reminders ────────────────────────────────────────────────────────

    @staticmethod
    async def find_overdue_for_reminder(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        today: date,
        remind_again_after: datetime,
    ) -> list[tuple[LearnerFee, Student, FeeItem, Guardian]]:
        """Overdue, unpaid `learner_fees` whose primary guardian has a
        phone on file, excluding ones reminded more recently than
        `remind_again_after` — the weekly job's idempotency guard so a
        retry or manual re-run within the same week doesn't double-text
        a guardian. Only the *primary* guardian is joined, so a student
        with two guardians on file gets exactly one text per fee."""
        stmt = (
            select(LearnerFee, Student, FeeItem, Guardian)
            .join(Student, Student.id == LearnerFee.student_id)
            .join(FeeItem, FeeItem.id == LearnerFee.fee_item_id)
            .join(
                StudentGuardian,
                and_(
                    StudentGuardian.student_id == Student.id,
                    StudentGuardian.is_primary.is_(True),
                ),
            )
            .join(Guardian, Guardian.id == StudentGuardian.guardian_id)
            .where(
                and_(
                    LearnerFee.school_id == school_id,
                    LearnerFee.deleted_at.is_(None),
                    LearnerFee.status.in_([OUTSTANDING, PARTIAL]),
                    LearnerFee.due_date.is_not(None),
                    LearnerFee.due_date < today,
                    Guardian.phone.is_not(None),
                    (LearnerFee.last_reminder_sent_at.is_(None))
                    | (LearnerFee.last_reminder_sent_at < remind_again_after),
                )
            )
        )
        return [(lf, st, fi, g) for lf, st, fi, g in (await session.execute(stmt)).all()]

    # ── summary ──────────────────────────────────────────────────────────

    @staticmethod
    async def summary(
        session: AsyncSession, school_id: UUID | str, *, today: date
    ) -> tuple[int, int, int, int, datetime | None]:
        """`(total_outstanding_minor, total_collected_minor, overdue_count,
        active_fee_items_count, last_reminder_sent_at)` for the
        Accountant dashboard."""
        outstanding_stmt = select(func.coalesce(func.sum(LearnerFee.balance_minor), 0)).where(
            and_(
                LearnerFee.school_id == school_id,
                LearnerFee.deleted_at.is_(None),
                LearnerFee.status.in_([OUTSTANDING, PARTIAL]),
            )
        )
        collected_stmt = select(func.coalesce(func.sum(FeePayment.amount_minor), 0)).where(
            FeePayment.school_id == school_id
        )
        overdue_stmt = select(func.count(LearnerFee.id)).where(
            and_(
                LearnerFee.school_id == school_id,
                LearnerFee.deleted_at.is_(None),
                LearnerFee.status.in_([OUTSTANDING, PARTIAL]),
                LearnerFee.due_date.is_not(None),
                LearnerFee.due_date < today,
            )
        )
        active_items_stmt = select(func.count(FeeItem.id)).where(
            and_(FeeItem.school_id == school_id, FeeItem.is_active.is_(True))
        )
        last_reminder_stmt = select(func.max(LearnerFee.last_reminder_sent_at)).where(
            LearnerFee.school_id == school_id
        )
        total_outstanding = int((await session.execute(outstanding_stmt)).scalar_one())
        total_collected = int((await session.execute(collected_stmt)).scalar_one())
        overdue_count = int((await session.execute(overdue_stmt)).scalar_one())
        active_fee_items_count = int((await session.execute(active_items_stmt)).scalar_one())
        last_reminder_sent_at = (await session.execute(last_reminder_stmt)).scalar_one()
        return (
            total_outstanding,
            total_collected,
            overdue_count,
            active_fee_items_count,
            last_reminder_sent_at,
        )
