"""HTTP routes for fees.

Every route requires `RequireAccountant` (Accountant or Admin) — this
is the finance domain, no per-user ownership fork like most other
features have — except `/fees/my-children`, which is the one
Parent-facing exception (plain `CurrentUserDep`, role checked in the
service, matching the rest of this codebase's parent-endpoint pattern).

GET    /fees/summary                             → dashboard aggregates
POST   /fees/items                              → create a fee item
GET    /fees/items                               → paged list
GET    /fees/items/{id}                          → fetch one
PATCH  /fees/items/{id}                          → edit (name/amount/active)
POST   /fees/items/{id}/assign                   → bulk-assign to the scope's roster
GET    /fees/items/{id}/learner-fees             → roster for one fee item
GET    /fees/learner-fees                        → balances/arrears, school-wide
GET    /fees/learner-fees/{id}                   → one learner's fee, with payments
PATCH  /fees/learner-fees/{id}                   → edit amount/due date
POST   /fees/learner-fees/{id}/waive             → waive
DELETE /fees/learner-fees/{id}                   → exclude (soft delete, no payments yet)
POST   /fees/learner-fees/{id}/payments          → record a payment
GET    /fees/my-children                         → Parent: own children's balances + history
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAccountant
from app.core.errors import ForbiddenError
from app.features.classes.repository import ClassesRepository
from app.features.fees.constants import LearnerFeeStatus
from app.features.fees.model import FeeItem, FeePayment, LearnerFee
from app.features.fees.schema import (
    FeeItemAssignResponse,
    FeeItemCreate,
    FeeItemRead,
    FeeItemsListResponse,
    FeeItemUpdate,
    FeePaymentCreate,
    FeePaymentRead,
    FeesSummary,
    LearnerFeeRead,
    LearnerFeesListResponse,
    LearnerFeeUpdate,
    MyChildrenFeesResponse,
)
from app.features.fees.service import FeesService
from app.features.staff.model import Staff
from app.features.students.model import Student

router = APIRouter(prefix="/fees", tags=["fees"])

_SCOPE_LABELS: dict[str, str] = {"school": "Whole school"}


def _fee_item_read(item: FeeItem, scope_display: str) -> FeeItemRead:
    return FeeItemRead(
        id=item.id,
        school_id=item.school_id,
        name=item.name,
        scope=item.scope,
        scope_ref=item.scope_ref,
        scope_display=scope_display,
        academic_year=item.academic_year,
        term=item.term,
        amount_minor=item.amount_minor,
        is_active=item.is_active,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _payment_read(payment: FeePayment, staff: Staff) -> FeePaymentRead:
    return FeePaymentRead(
        id=payment.id,
        learner_fee_id=payment.learner_fee_id,
        amount_minor=payment.amount_minor,
        method=payment.method,
        reference=payment.reference,
        receipt_file_urls=payment.receipt_file_urls or [],
        recorded_by_id=payment.recorded_by_id,
        recorded_by_name=f"{staff.first_name} {staff.last_name}",
        paid_at=payment.paid_at,
        created_at=payment.created_at,
    )


def _learner_fee_read(
    row: LearnerFee,
    student: Student,
    fee_item: FeeItem,
    payments: list[tuple[FeePayment, Staff]] | None = None,
) -> LearnerFeeRead:
    return LearnerFeeRead(
        id=row.id,
        school_id=row.school_id,
        student_id=student.id,
        student_first_name=student.first_name,
        student_last_name=student.last_name,
        student_slug=student.slug,
        fee_item_id=fee_item.id,
        fee_item_name=fee_item.name,
        amount_minor=row.amount_minor,
        status=row.status,
        balance_minor=row.balance_minor,
        due_date=row.due_date,
        created_at=row.created_at,
        updated_at=row.updated_at,
        payments=[_payment_read(p, s) for p, s in (payments or [])],
    )


async def _scope_display(session: AsyncSession, school_id: UUID | str, item: FeeItem) -> str:
    if item.scope == "school":
        return _SCOPE_LABELS["school"]
    if item.scope == "division":
        return str(item.scope_ref)
    cls = await ClassesRepository.get_by_id(session, school_id, str(item.scope_ref))
    return cls.name if cls else "Unknown class"


@router.get("/summary", response_model=FeesSummary, response_model_by_alias=True)
async def get_fees_summary(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> FeesSummary:
    (
        total_outstanding,
        total_collected,
        overdue_count,
        active_fee_items_count,
    ) = await FeesService.summary(session, school_id)
    return FeesSummary(
        total_outstanding_minor=total_outstanding,
        total_collected_minor=total_collected,
        overdue_count=overdue_count,
        active_fee_items_count=active_fee_items_count,
    )


@router.post(
    "/items",
    response_model=FeeItemRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_fee_item(
    payload: FeeItemCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> FeeItemRead:
    item = await FeesService.create_fee_item(session, school_id, payload)
    return _fee_item_read(item, await _scope_display(session, school_id, item))


@router.get("/items", response_model=FeeItemsListResponse, response_model_by_alias=True)
async def list_fee_items(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
    academic_year: Annotated[str | None, Query(alias="academicYear")] = None,
    term: Annotated[int | None, Query(ge=1, le=3)] = None,
    is_active: Annotated[bool | None, Query(alias="isActive")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> FeeItemsListResponse:
    items, total = await FeesService.list_fee_items(
        session,
        school_id,
        academic_year=academic_year,
        term=term,
        is_active=is_active,
        page=page,
        size=size,
    )
    reads = [_fee_item_read(item, await _scope_display(session, school_id, item)) for item in items]
    return FeeItemsListResponse(items=reads, total=total, page=page, size=size)


@router.get("/items/{fee_item_id}", response_model=FeeItemRead, response_model_by_alias=True)
async def get_fee_item(
    fee_item_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> FeeItemRead:
    item = await FeesService.get_fee_item(session, school_id, fee_item_id)
    return _fee_item_read(item, await _scope_display(session, school_id, item))


@router.patch("/items/{fee_item_id}", response_model=FeeItemRead, response_model_by_alias=True)
async def update_fee_item(
    fee_item_id: UUID,
    payload: FeeItemUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> FeeItemRead:
    item = await FeesService.update_fee_item(session, school_id, fee_item_id, payload)
    return _fee_item_read(item, await _scope_display(session, school_id, item))


@router.post(
    "/items/{fee_item_id}/assign",
    response_model=FeeItemAssignResponse,
    response_model_by_alias=True,
)
async def assign_fee_item(
    fee_item_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> FeeItemAssignResponse:
    created_count, already_assigned_count, rows = await FeesService.assign_fee_item(
        session, school_id, fee_item_id
    )
    return FeeItemAssignResponse(
        created_count=created_count,
        already_assigned_count=already_assigned_count,
        learner_fees=[_learner_fee_read(lf, st, fi) for lf, st, fi in rows],
    )


@router.get(
    "/items/{fee_item_id}/learner-fees",
    response_model=list[LearnerFeeRead],
    response_model_by_alias=True,
)
async def list_learner_fees_for_fee_item(
    fee_item_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> list[LearnerFeeRead]:
    # Ensures the fee item belongs to this school before listing its roster.
    await FeesService.get_fee_item(session, school_id, fee_item_id)
    rows = await FeesService.list_learner_fees_for_fee_item(session, fee_item_id)
    return [_learner_fee_read(lf, st, fi) for lf, st, fi in rows]


@router.get("/learner-fees", response_model=LearnerFeesListResponse, response_model_by_alias=True)
async def list_learner_fees(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
    status_: Annotated[LearnerFeeStatus | None, Query(alias="status")] = None,
    student_id: Annotated[UUID | None, Query(alias="studentId")] = None,
    fee_item_id: Annotated[UUID | None, Query(alias="feeItemId")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> LearnerFeesListResponse:
    rows, total = await FeesService.list_learner_fees_for_school(
        session,
        school_id,
        status=status_,
        student_id=student_id,
        fee_item_id=fee_item_id,
        page=page,
        size=size,
    )
    return LearnerFeesListResponse(
        items=[_learner_fee_read(lf, st, fi) for lf, st, fi in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/learner-fees/{learner_fee_id}", response_model=LearnerFeeRead, response_model_by_alias=True
)
async def get_learner_fee(
    learner_fee_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> LearnerFeeRead:
    row, student, item = await FeesService.get_learner_fee(session, school_id, learner_fee_id)
    payments = await FeesService.list_payments(session, row.id)
    return _learner_fee_read(row, student, item, payments)


@router.patch(
    "/learner-fees/{learner_fee_id}", response_model=LearnerFeeRead, response_model_by_alias=True
)
async def update_learner_fee(
    learner_fee_id: UUID,
    payload: LearnerFeeUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> LearnerFeeRead:
    row, student, item = await FeesService.update_learner_fee(
        session, school_id, learner_fee_id, payload
    )
    payments = await FeesService.list_payments(session, row.id)
    return _learner_fee_read(row, student, item, payments)


@router.post(
    "/learner-fees/{learner_fee_id}/waive",
    response_model=LearnerFeeRead,
    response_model_by_alias=True,
)
async def waive_learner_fee(
    learner_fee_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> LearnerFeeRead:
    row, student, item = await FeesService.waive_learner_fee(session, school_id, learner_fee_id)
    payments = await FeesService.list_payments(session, row.id)
    return _learner_fee_read(row, student, item, payments)


@router.delete("/learner-fees/{learner_fee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def exclude_learner_fee(
    learner_fee_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _user: RequireAccountant,
) -> None:
    await FeesService.exclude_learner_fee(session, school_id, learner_fee_id)


@router.post(
    "/learner-fees/{learner_fee_id}/payments",
    response_model=LearnerFeeRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def record_payment(
    learner_fee_id: UUID,
    payload: FeePaymentCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAccountant,
) -> LearnerFeeRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot record a payment without a staff identity.")
    row, student, item, payments = await FeesService.record_payment(
        session, school_id, learner_fee_id, payload, actor_staff_id=user.linked_id
    )
    return _learner_fee_read(row, student, item, payments)


@router.get(
    "/my-children",
    response_model=MyChildrenFeesResponse,
    response_model_by_alias=True,
)
async def get_my_children_fees(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> MyChildrenFeesResponse:
    children = await FeesService.my_children_fees(session, school_id, user=user)
    return MyChildrenFeesResponse(children=children)
