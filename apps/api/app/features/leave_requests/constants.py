"""Closed sets for `leave_requests.status` + `.type`."""

from __future__ import annotations

from typing import Final, Literal

PENDING: Final = "pending"
APPROVED: Final = "approved"
REJECTED: Final = "rejected"
CANCELLED: Final = "cancelled"

LeaveStatus = Literal["pending", "approved", "rejected", "cancelled"]

# Free-text on the wire but the frontend picks from a fixed set — keep
# them enumerated here so we can validate on the server too.
LeaveType = Literal[
    "Casual",
    "Sick",
    "Maternity",
    "Paternity",
    "Study",
    "Compassionate",
    "Other",
]
