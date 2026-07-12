"""Closed sets of `sms_log.category` / `.status` / `.provider` values.

Values are the literal strings written to the columns — content must
not change once rows exist. Mirrors the shape sketched in
`v2/UHAS_Data_Model_v2.0.md` §5.5.
"""

from __future__ import annotations

from typing import Final, Literal

ABSENCE: Final = "absence"
RESULTS: Final = "results"
FEE_REMINDER: Final = "fee_reminder"
ANNOUNCEMENT: Final = "announcement"
ONBOARDING: Final = "onboarding"
APPOINTMENT: Final = "appointment"
OTHER: Final = "other"

SmsCategory = Literal[
    "absence", "results", "fee_reminder", "announcement", "onboarding", "appointment", "other"
]

QUEUED: Final = "queued"
SENT: Final = "sent"
DELIVERED: Final = "delivered"
FAILED: Final = "failed"

SmsStatus = Literal["queued", "sent", "delivered", "failed"]

STUB: Final = "stub"
HUBTEL: Final = "hubtel"
ARKESEL: Final = "arkesel"

SmsProviderName = Literal["stub", "hubtel", "arkesel"]
