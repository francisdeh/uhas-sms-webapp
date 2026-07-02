"""Closed set of `lesson_plans.status` values + the state machine.

State machine:

    draft ──submit──► submitted ──unit_head_approve──► unit_head_approved
      ▲                  │                                    │
      │                  │                                    └─deputy_head_approve─► approved
      │             unit_head_reject                    deputy_head_reject
      │                  │                                    │
      └──────── rejected ◄────────────────────────────────────┘

`rejected` is a "back to teacher" state — the teacher can edit and
resubmit (rejected → draft on edit, then draft → submitted on submit).

Kept out of `schema.py` so both `service.py` and the router share the
canonical spelling — no strays like `"unitHeadApproved"` vs
`"unit_head_approved"`.
"""

from __future__ import annotations

from typing import Final, Literal

DRAFT: Final = "draft"
SUBMITTED: Final = "submitted"
UNIT_HEAD_APPROVED: Final = "unit_head_approved"
APPROVED: Final = "approved"
REJECTED: Final = "rejected"

LessonPlanStatus = Literal[
    "draft",
    "submitted",
    "unit_head_approved",
    "approved",
    "rejected",
]
