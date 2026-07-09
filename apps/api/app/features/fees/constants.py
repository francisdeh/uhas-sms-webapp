"""Closed sets for the Fees domain.

`fee_items.scope` decides who a fee applies to; `learner_fees.status`
tracks one learner's standing against one fee item; `fee_payments.method`
records how a payment (always Accountant-entered — parents do not pay
online) was made.
"""

from __future__ import annotations

from typing import Final, Literal

# ── fee_items.scope ──────────────────────────────────────────────────────────
SCOPE_SCHOOL: Final = "school"
SCOPE_DIVISION: Final = "division"
SCOPE_CLASS: Final = "class"

FeeScope = Literal["school", "division", "class"]

# ── learner_fees.status ──────────────────────────────────────────────────────
OUTSTANDING: Final = "outstanding"
PARTIAL: Final = "partial"
PAID: Final = "paid"
WAIVED: Final = "waived"

LearnerFeeStatus = Literal["outstanding", "partial", "paid", "waived"]

# ── fee_payments.method ──────────────────────────────────────────────────────
CASH: Final = "cash"
MOMO: Final = "momo"
BANK: Final = "bank"
CHEQUE: Final = "cheque"

PaymentMethod = Literal["cash", "momo", "bank", "cheque"]
