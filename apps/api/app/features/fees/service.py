"""Business logic for Fees.

Simpler authorization shape than most domains: every endpoint is
Accountant/Admin-only (enforced at the router via `RequireAccountant`),
so there's no per-user ownership fork to check here — just data
validation and the balance/status bookkeeping that comes from tracking
money.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.roles import PARENT
from app.core.school_structure import DIVISIONS
from app.core.security import CurrentUser
from app.features.audit.actions import (
    FEE_ITEM_UPDATED,
    FEE_PAYMENT_RECORDED,
    LEARNER_FEE_EXCLUDED,
    LEARNER_FEE_UPDATED,
    LEARNER_FEE_WAIVED,
)
from app.features.audit.service import write_audit_log
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
    ChildFeesRead,
    FeeItemCreate,
    FeeItemUpdate,
    FeePaymentCreate,
    LearnerFeeUpdate,
    ParentFeePaymentRead,
    ParentLearnerFeeRead,
)
from app.features.guardians.model import Guardian
from app.features.notifications.constants import FEE_REMINDER as NOTIF_FEE_REMINDER
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.sms.constants import FEE_REMINDER as SMS_FEE_REMINDER
from app.features.sms.service import SmsService
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.features.students.service import StudentsService
from app.integrations.sms.provider import SmsProvider

# A retry of the same weekly cron run (or a manual re-trigger) within
# this window won't double-text a guardian for the same fee.
_REMINDER_COOLDOWN = timedelta(days=6)


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
        *,
        actor_user_id: UUID | str,
    ) -> FeeItem:
        item = await FeesService.get_fee_item(session, school_id, fee_item_id)
        before_snapshot: dict[str, object | None] = {}
        after_snapshot: dict[str, object | None] = {}
        for field, value in payload.model_dump(exclude_unset=True).items():
            old_value = getattr(item, field)
            if old_value != value:
                before_snapshot[field] = old_value
                after_snapshot[field] = value
                setattr(item, field, value)
        item.updated_at = _now()
        await session.flush()
        if before_snapshot:
            await write_audit_log(
                session,
                school_id=school_id,
                user_id=actor_user_id,
                action=FEE_ITEM_UPDATED,
                target_table="fee_items",
                target_id=item.id,
                before=before_snapshot,
                after=after_snapshot,
            )
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
        *,
        actor_user_id: UUID | str,
    ) -> tuple[LearnerFee, Student, FeeItem]:
        row, student, item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
        if row.status == WAIVED:
            raise ConflictError("Cannot edit a waived fee.")

        changes = payload.model_dump(exclude_unset=True)
        before_snapshot: dict[str, object | None] = {}
        after_snapshot: dict[str, object | None] = {}
        if "amount_minor" in changes and changes["amount_minor"] != row.amount_minor:
            before_snapshot["amountMinor"] = row.amount_minor
            after_snapshot["amountMinor"] = changes["amount_minor"]
            paid_so_far = await FeesRepository.sum_paid_for_learner_fee(session, row.id)
            row.amount_minor = changes["amount_minor"]
            _recompute_balance_and_status(row, paid_so_far)
        if "due_date" in changes and changes["due_date"] != row.due_date:
            before_snapshot["dueDate"] = str(row.due_date) if row.due_date else None
            after_snapshot["dueDate"] = str(changes["due_date"]) if changes["due_date"] else None
            row.due_date = changes["due_date"]
        row.updated_at = _now()
        await session.flush()
        if before_snapshot:
            await write_audit_log(
                session,
                school_id=school_id,
                user_id=actor_user_id,
                action=LEARNER_FEE_UPDATED,
                target_table="learner_fees",
                target_id=row.id,
                before=before_snapshot,
                after=after_snapshot,
            )
        return row, student, item

    @staticmethod
    async def waive_learner_fee(
        session: AsyncSession,
        school_id: UUID | str,
        learner_fee_id: UUID | str,
        *,
        actor_user_id: UUID | str,
    ) -> tuple[LearnerFee, Student, FeeItem]:
        row, student, item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
        before_balance = row.balance_minor
        row.status = WAIVED
        row.balance_minor = 0
        row.updated_at = _now()
        await session.flush()
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=LEARNER_FEE_WAIVED,
            target_table="learner_fees",
            target_id=row.id,
            before={"balanceMinor": before_balance},
            after={"balanceMinor": 0},
        )
        return row, student, item

    @staticmethod
    async def exclude_learner_fee(
        session: AsyncSession,
        school_id: UUID | str,
        learner_fee_id: UUID | str,
        *,
        actor_user_id: UUID | str,
    ) -> None:
        row, _student, _item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
        paid_so_far = await FeesRepository.sum_paid_for_learner_fee(session, row.id)
        if paid_so_far > 0:
            raise ConflictError("Cannot exclude a learner fee that already has payments recorded.")
        await FeesRepository.soft_delete_learner_fee(session, row, when=_now())
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=LEARNER_FEE_EXCLUDED,
            target_table="learner_fees",
            target_id=row.id,
            before={"amountMinor": row.amount_minor},
            after=None,
        )

    # ── fee_payments ─────────────────────────────────────────────────────

    @staticmethod
    async def record_payment(
        session: AsyncSession,
        school_id: UUID | str,
        learner_fee_id: UUID | str,
        payload: FeePaymentCreate,
        *,
        actor_staff_id: UUID | str,
        actor_user_id: UUID | str,
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
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=FEE_PAYMENT_RECORDED,
            target_table="learner_fees",
            target_id=row.id,
            after={
                "amountMinor": payload.amount_minor,
                "method": payload.method,
                "reference": payload.reference,
            },
        )

        payments = await FeesRepository.list_payments_for_learner_fee(session, row.id)
        return row, student, item, payments

    @staticmethod
    async def list_payments(
        session: AsyncSession, learner_fee_id: UUID | str
    ) -> list[tuple[FeePayment, Staff]]:
        return await FeesRepository.list_payments_for_learner_fee(session, learner_fee_id)

    # ── summary ──────────────────────────────────────────────────────────

    @staticmethod
    async def summary(
        session: AsyncSession, school_id: UUID | str
    ) -> tuple[int, int, int, int, datetime | None]:
        return await FeesRepository.summary(session, school_id, today=_now().date())

    # ── reminders ────────────────────────────────────────────────────────

    @staticmethod
    async def send_overdue_reminders(
        session: AsyncSession, school_id: UUID | str, *, provider: SmsProvider | None = None
    ) -> int:
        """Weekly job entry point. One SMS + one in-app notification per
        guardian, even when they have several overdue fees — avoids
        multi-text spam to the same household in one run. Returns the
        number of `learner_fees` rows just reminded."""
        now = _now()
        rows = await FeesRepository.find_overdue_for_reminder(
            session, school_id, today=now.date(), remind_again_after=now - _REMINDER_COOLDOWN
        )
        if not rows:
            return 0

        by_guardian: dict[UUID, list[tuple[LearnerFee, Student, FeeItem, Guardian]]] = {}
        for lf, student, fee_item, guardian in rows:
            by_guardian.setdefault(guardian.id, []).append((lf, student, fee_item, guardian))

        for guardian_rows in by_guardian.values():
            guardian = guardian_rows[0][3]
            body = _reminder_message(guardian_rows)

            await SmsService.send(
                session,
                school_id=school_id,
                recipient_phone=guardian.phone,  # type: ignore[arg-type]
                recipient_guardian_id=guardian.id,
                category=SMS_FEE_REMINDER,
                body=body,
                provider=provider,
            )

            guardian_user = await NotificationsService.find_user_for_linked(
                session, school_id, guardian.id
            )
            if guardian_user is not None:
                await NotificationsService.notify_user(
                    session,
                    school_id,
                    user_id=guardian_user.id,
                    payload=NotifyPayload(
                        kind=NOTIF_FEE_REMINDER,
                        title="Fee reminder",
                        body=body,
                        link="/parent/fees",
                    ),
                )

            for lf, _st, _fi, _g in guardian_rows:
                lf.last_reminder_sent_at = now

        await session.flush()
        return len(rows)

    # ── parent view ──────────────────────────────────────────────────────

    @staticmethod
    async def my_children_fees(
        session: AsyncSession, school_id: UUID | str, *, user: CurrentUser
    ) -> list[ChildFeesRead]:
        """A Parent's own children's fee balances + payment history — no
        recorder identity (see `ParentFeePaymentRead` docstring), but
        receipt files ARE included. Every other role is refused;
        there's no legitimate reason for Admin/Accountant/Teacher to
        hit this specific view (they already have the full picture via
        the other endpoints)."""
        if user.role != PARENT or not user.linked_id:
            raise ForbiddenError("Only a parent can view this.")

        children = await StudentsService.list_for_guardian(
            session, school_id, user.linked_id, user=user
        )
        student_ids = [student.id for student, _cls, _fallback_year in children]
        rows = await FeesRepository.list_learner_fees_for_students(session, school_id, student_ids)

        learner_fee_ids = [lf.id for lf, _st, _fi in rows]
        payments = await FeesRepository.list_payments_for_learner_fees(session, learner_fee_ids)
        payments_by_learner_fee: dict[UUID, list[FeePayment]] = {}
        for payment in payments:
            payments_by_learner_fee.setdefault(payment.learner_fee_id, []).append(payment)

        rows_by_student: dict[UUID, list[tuple[LearnerFee, FeeItem]]] = {}
        for lf, st, fi in rows:
            rows_by_student.setdefault(st.id, []).append((lf, fi))

        result: list[ChildFeesRead] = []
        for student, _cls, _fallback_year in children:
            student_rows = rows_by_student.get(student.id, [])
            fees = [
                ParentLearnerFeeRead(
                    id=lf.id,
                    fee_item_name=fi.name,
                    amount_minor=lf.amount_minor,
                    status=lf.status,
                    balance_minor=lf.balance_minor,
                    due_date=lf.due_date,
                    payments=[
                        ParentFeePaymentRead(
                            id=p.id,
                            amount_minor=p.amount_minor,
                            method=p.method,
                            paid_at=p.paid_at,
                            receipt_file_urls=p.receipt_file_urls or [],
                        )
                        for p in payments_by_learner_fee.get(lf.id, [])
                    ],
                )
                for lf, fi in student_rows
            ]
            result.append(
                ChildFeesRead(
                    student_id=student.id,
                    student_first_name=student.first_name,
                    student_last_name=student.last_name,
                    total_owed_minor=sum(lf.amount_minor for lf, _fi in student_rows),
                    total_outstanding_minor=sum(
                        lf.balance_minor
                        for lf, _fi in student_rows
                        if lf.status in (OUTSTANDING, PARTIAL)
                    ),
                    fees=fees,
                )
            )
        return result


def _reminder_message(rows: list[tuple[LearnerFee, Student, FeeItem, Guardian]]) -> str:
    """Plain ASCII only (no "GH₵") — a currency symbol outside GSM-7
    would push the whole SMS into UCS-2 encoding, cutting the
    per-segment length from 160 to 70 chars and likely doubling cost
    for no readability gain."""
    guardian = rows[0][3]
    total_minor = sum(lf.balance_minor for lf, _st, _fi, _g in rows)
    total = f"GHS {total_minor / 100:,.2f}"
    if len(rows) == 1:
        _lf, student, fee_item, _g = rows[0]
        return (
            f"Dear {guardian.first_name}, {student.first_name} {student.last_name}'s "
            f"{fee_item.name} balance of {total} is overdue. Please settle at your "
            f"earliest convenience. - UHAS"
        )
    names = {f"{st.first_name} {st.last_name}" for _lf, st, _fi, _g in rows}
    student_names = ", ".join(sorted(names))
    return (
        f"Dear {guardian.first_name}, you have {len(rows)} overdue school fees "
        f"totaling {total} for {student_names}. Please settle at your earliest "
        f"convenience. - UHAS"
    )


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
