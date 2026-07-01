"""Closed set of `attendance_records.status` values.

Both the schema and the service reference these; keeping them here
avoids drift between the two.
"""

from __future__ import annotations

from typing import Final, Literal

PRESENT: Final = "Present"
ABSENT: Final = "Absent"
LATE: Final = "Late"
EXCUSED: Final = "Excused"

AttendanceStatus = Literal["Present", "Absent", "Late", "Excused"]
