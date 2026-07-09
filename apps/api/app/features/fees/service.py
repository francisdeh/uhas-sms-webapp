"""Business logic for Fees.

Simpler authorization shape than most domains: every endpoint is
Accountant/Admin-only (enforced at the router via `RequireAccountant`),
so there's no per-user ownership fork to check here — just data
validation and the balance/status bookkeeping that comes from tracking
money.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.school_structure import DIVISIONS
from app.features.classes.repository import ClassesRepository
from app.features.fees.constants import (
    OUTSTANDING,
    PAID,
    PARTIAL,
    SCOPE_CLASS,
    SCOPE_DIVISION,
    WAIVED,
)
from app.features.fees.model import FeeItem, FeePayment, LearnerFee
from app.features.fees.repository import FeesRepository
from app.features.fees.schema import (
    FeeItemCreate,
    FeeItemUpdate,
    FeePaymentCreate,
    LearnerFeeUpdate,
)
from app.features.staff.model import Staff
from app.features.students.model import Student


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class FeesService:
    # ── fee_items ────────────────────────────────────────────────────────

    @staticmethod
    async def create_fee_item(
        session: AsyncSession, school_id: UUID | str, payload: FeeItemCreate
    ) -> FeeItem:
        await _validate_scope(session, school_id, scope=payload.scope, scope_ref=payload.scope_ref)
        item = FeeItem(
            school_id=school_id,
            name=payload.name,
            scope=payload.scope,
            scope_ref=payload.scope_ref,
            academic_year=payload.academic_year,
            term=payload.term,
            amount_minor=payload.amount_minor,
            is_active=True,
        )
        return await FeesRepository.insert_fee_item(session, item)

    @staticmethod
    async def get_fee_item(
        session: AsyncSession, school_id: UUID | str, fee_item_id: UUID | str
    ) -> FeeItem:
        item = await FeesRepository.get_fee_item_by_id(session, school_id, fee_item_id)
        if not item:
            raise NotFoundError(f"Fee item {fee_item_id!r} not found.")
        return item

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
        return await FeesRepository.list_fee_items(
            session,
            school_id,
            academic_year=academic_year,
            term=term,
            is_active=is_active,
            page=page,
            size=size,
        )

    @staticmethod
    async def update_fee_item(
        session: AsyncSession,
        school_id: UUID | str,
        fee_item_id: UUID | str,
        payload: FeeItemUpdate,
    ) -> FeeItem:
        item = await FeesService.get_fee_item(session, school_id, fee_item_id)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        item.updated_at = _now()
        await session.flush()
        return item

    # ── assignment ───────────────────────────────────────────────────────

    @staticmethod
    async def assign_fee_item(
        session: AsyncSession, school_id: UUID | str, fee_item_id: UUID | str
    ) -> tuple[int, int, list[tuple[LearnerFee, Student, FeeItem]]]:
        """Bulk-create one `learner_fees` row per actively-enrolled
        student in the fee item's scope, skipping students who already
        have one. Safe to call again after new students enroll."""
        item = await FeesService.get_fee_item(session, school_id, fee_item_id)
        roster = await FeesRepository.active_students_in_scope(
            session,
            school_id,
            scope=item.scope,
            scope_ref=item.scope_ref,
            academic_year=item.academic_year,
        )
        already_assigned = await FeesRepository.existing_student_ids_for_fee_item(session, item.id)
        to_create = [s for s in roster if str(s.id) not in already_assigned]

        new_rows = [
            LearnerFee(
                school_id=school_id,
                student_id=student.id,
                fee_item_id=item.id,
                amount_minor=item.amount_minor,
                status=OUTSTANDING,
                balance_minor=item.amount_minor,
            )
            for student in to_create
        ]
        if new_rows:
            await FeesRepository.insert_learner_fees(session, new_rows)

        rows = await FeesRepository.list_learner_fees_for_fee_item(session, item.id)
        return len(new_rows), len(already_assigned), rows

    # ── learner_fees ─────────────────────────────────────────────────────

    @staticmethod
    async def get_learner_fee(
        session: AsyncSession, school_id: UUID | str, learner_fee_id: UUID | str
    ) -> tuple[LearnerFee, Student, FeeItem]:
        row = await FeesRepository.get_learner_fee_by_id(session, school_id, learner_fee_id)
        if not row:
            raise NotFoundError(f"Learner fee {learner_fee_id!r} not found.")
        return row

    @staticmethod
    async def list_learner_fees_for_fee_item(
        session: AsyncSession, fee_item_id: UUID | str
    ) -> list[tuple[LearnerFee, Student, FeeItem]]:
        return await FeesRepository.list_learner_fees_for_fee_item(session, fee_item_id)

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
        return await FeesRepository.list_learner_fees_for_school(
            session,
            school_id,
            status=status,
            student_id=student_id,
            fee_item_id=fee_item_id,
            page=page,
            size=size,
        )

    @staticmethod
    async def update_learner_fee(
        session: AsyncSession,
        school_id: UUID | str,
        learner_fee_id: UUID | str,
        payload: LearnerFeeUpdate,
    ) -> tuple[LearnerFee, Student, FeeItem]:
        row, student, item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
        if row.status == WAIVED:
            raise ConflictError("Cannot edit a waived fee.")

        changes = payload.model_dump(exclude_unset=True)
        if "amount_minor" in changes:
            paid_so_far = await FeesRepository.sum_paid_for_learner_fee(session, row.id)
            row.amount_minor = changes["amount_minor"]
            _recompute_balance_and_status(row, paid_so_far)
        if "due_date" in changes:
            row.due_date = changes["due_date"]
        row.updated_at = _now()
        await session.flush()
        return row, student, item

    @staticmethod
    async def waive_learner_fee(
        session: AsyncSession, school_id: UUID | str, learner_fee_id: UUID | str
    ) -> tuple[LearnerFee, Student, FeeItem]:
        row, student, item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
        row.status = WAIVED
        row.balance_minor = 0
        row.updated_at = _now()
        await session.flush()
        return row, student, item

    @staticmethod
    async def exclude_learner_fee(
        session: AsyncSession, school_id: UUID | str, learner_fee_id: UUID | str
    ) -> None:
        row, _student, _item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
        paid_so_far = await FeesRepository.sum_paid_for_learner_fee(session, row.id)
        if paid_so_far > 0:
            raise ConflictError("Cannot exclude a learner fee that already has payments recorded.")
        await FeesRepository.soft_delete_learner_fee(session, row, when=_now())

    # ── fee_payments ─────────────────────────────────────────────────────

    @staticmethod
    async def record_payment(
        session: AsyncSession,
        school_id: UUID | str,
        learner_fee_id: UUID | str,
        payload: FeePaymentCreate,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[LearnerFee, Student, FeeItem, list[tuple[FeePayment, Staff]]]:
        row, student, item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
        if row.status == WAIVED:
            raise ConflictError("Cannot record a payment against a waived fee.")

        paid_so_far = await FeesRepository.sum_paid_for_learner_fee(session, row.id)
        if paid_so_far + payload.amount_minor > row.amount_minor:
            raise ValidationError("Payment would exceed the amount owed for this fee.")

        payment = FeePayment(
            school_id=school_id,
            learner_fee_id=row.id,
            amount_minor=payload.amount_minor,
            method=payload.method,
            reference=payload.reference,
            receipt_file_urls=payload.receipt_file_urls,
            recorded_by_id=actor_staff_id,
            paid_at=payload.paid_at or _now(),
        )
        await FeesRepository.insert_payment(session, payment)

        _recompute_balance_and_status(row, paid_so_far + payload.amount_minor)
        row.updated_at = _now()
        await session.flush()

        payments = await FeesRepository.list_payments_for_learner_fee(session, row.id)
        return row, student, item, payments

    @staticmethod
    async def list_payments(
        session: AsyncSession, learner_fee_id: UUID | str
    ) -> list[tuple[FeePayment, Staff]]:
        return await FeesRepository.list_payments_for_learner_fee(session, learner_fee_id)

    # ── summary ──────────────────────────────────────────────────────────

    @staticmethod
    async def summary(session: AsyncSession, school_id: UUID | str) -> tuple[int, int, int, int]:
        return await FeesRepository.summary(session, school_id, today=_now().date())


def _recompute_balance_and_status(row: LearnerFee, total_paid: int) -> None:
    row.balance_minor = max(0, row.amount_minor - total_paid)
    if row.balance_minor <= 0:
        row.status = PAID
    elif total_paid > 0:
        row.status = PARTIAL
    else:
        row.status = OUTSTANDING


async def _validate_scope(
    session: AsyncSession, school_id: UUID | str, *, scope: str, scope_ref: str | None
) -> None:
    if scope == "school":
        if scope_ref is not None:
            raise ValidationError("scope_ref must be omitted when scope is 'school'.")
        return
    if scope == SCOPE_DIVISION:
        if scope_ref not in DIVISIONS:
            raise ValidationError(f"scope_ref must be one of {DIVISIONS} when scope is 'division'.")
        return
    if scope == SCOPE_CLASS:
        if not scope_ref:
            raise ValidationError("scope_ref is required when scope is 'class'.")
        cls = await ClassesRepository.get_by_id(session, school_id, scope_ref)
        if not cls:
            raise ValidationError("Class not found in this school.")
