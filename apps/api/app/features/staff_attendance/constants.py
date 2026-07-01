"""Closed set of `staff_attendance_records.status` values.

Kept distinct from the student equivalent — staff can be "OnLeave"
(which references an approved leave_request); students never can.
"""

from __future__ import annotations

from typing import Final, Literal

PRESENT: Final = "Present"
ABSENT: Final = "Absent"
LATE: Final = "Late"
ON_LEAVE: Final = "OnLeave"

StaffAttendanceStatus = Literal["Present", "Absent", "Late", "OnLeave"]
