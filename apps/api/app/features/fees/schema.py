"""Pydantic schemas for the Fees domain."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.fees.constants import FeeScope, LearnerFeeStatus, PaymentMethod

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class FeeItemCreate(BaseModel):
    model_config = _CAMEL_CONFIG

    name: str = Field(..., min_length=1, max_length=255)
    scope: FeeScope
    # Required when scope is "division" (a Division value) or "class" (a
    # classes.id); must be omitted when scope is "school". Validated
    # against `scope` in the service layer.
    scope_ref: str | None = None
    academic_year: str = Field(..., pattern=r"^\d{4}/\d{4}$")
    term: int | None = Field(None, ge=1, le=3)
    amount_minor: int = Field(..., gt=0)


class FeeItemUpdate(BaseModel):
    model_config = _CAMEL_CONFIG

    name: str | None = Field(None, min_length=1, max_length=255)
    amount_minor: int | None = Field(None, gt=0)
    is_active: bool | None = None


class FeeItemRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    name: str
    scope: FeeScope
    scope_ref: str | None = None
    scope_display: str
    academic_year: str
    term: int | None = None
    amount_minor: int
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FeeItemsListResponse(Paginated[FeeItemRead]):
    """Paged list of fee items."""


class FeePaymentCreate(BaseModel):
    """`POST /fees/learner-fees/{id}/payments` — Accountant records a
    payment already collected. `paid_at` defaults to now when omitted."""

    model_config = _CAMEL_CONFIG

    amount_minor: int = Field(..., gt=0)
    method: PaymentMethod
    reference: str | None = Field(None, max_length=255)
    paid_at: datetime | None = None
    receipt_file_urls: list[str] = Field(default_factory=list)


class FeePaymentRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    learner_fee_id: UUID
    amount_minor: int
    method: PaymentMethod
    reference: str | None = None
    receipt_file_urls: list[str] = Field(default_factory=list)
    recorded_by_id: UUID
    recorded_by_name: str
    paid_at: datetime
    created_at: datetime | None = None


class LearnerFeeUpdate(BaseModel):
    """Edit an individual learner's assignment — amount override or due
    date. Waiving and excluding are separate, more explicit actions
    (`POST .../waive`, `DELETE`) rather than status transitions here."""

    model_config = _CAMEL_CONFIG

    amount_minor: int | None = Field(None, gt=0)
    due_date: date | None = None


class LearnerFeeRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    student_id: UUID
    student_first_name: str
    student_last_name: str
    student_slug: str
    fee_item_id: UUID
    fee_item_name: str
    amount_minor: int
    status: LearnerFeeStatus
    balance_minor: int
    due_date: date | None = None
    last_reminder_sent_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    payments: list[FeePaymentRead] = Field(default_factory=list)


class LearnerFeesListResponse(Paginated[LearnerFeeRead]):
    """Paged list — the balances/arrears view."""


class FeeItemAssignResponse(BaseModel):
    """Result of bulk-assigning a fee item to its scope's roster."""

    model_config = _CAMEL_CONFIG

    created_count: int
    already_assigned_count: int
    learner_fees: list[LearnerFeeRead] = Field(default_factory=list)


class FeesSummary(BaseModel):
    """Aggregate figures for the Accountant dashboard overview."""

    model_config = _CAMEL_CONFIG

    total_outstanding_minor: int
    total_collected_minor: int
    overdue_count: int
    active_fee_items_count: int
    last_reminder_sent_at: datetime | None = None


class ParentFeePaymentRead(BaseModel):
    """A payment as a parent sees it — deliberately narrower than
    `FeePaymentRead`: no `recordedBy*` (Accountant-internal) and no
    `receiptFileUrls` (the Accountant's proof-of-payment, not the
    parent's document)."""

    model_config = _CAMEL_CONFIG

    id: UUID
    amount_minor: int
    method: PaymentMethod
    paid_at: datetime


class ParentLearnerFeeRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    fee_item_name: str
    amount_minor: int
    status: LearnerFeeStatus
    balance_minor: int
    due_date: date | None = None
    payments: list[ParentFeePaymentRead] = Field(default_factory=list)


class ChildFeesRead(BaseModel):
    model_config = _CAMEL_CONFIG

    student_id: UUID
    student_first_name: str
    student_last_name: str
    total_owed_minor: int
    total_outstanding_minor: int
    fees: list[ParentLearnerFeeRead] = Field(default_factory=list)


class MyChildrenFeesResponse(BaseModel):
    model_config = _CAMEL_CONFIG

    children: list[ChildFeesRead] = Field(default_factory=list)
