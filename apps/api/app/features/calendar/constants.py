"""Closed set of `calendar_events.type` values.

The academic calendar is a small, curated list managed by Admin only.
Adding a new event kind means: (1) add the Final constant here,
(2) extend the `CalendarEventType` union, (3) update the FE `Select`
options in `CalendarView.tsx`.

Mirrors the TS union in
[apps/web/src/features/reports/types.ts](../../../../web/src/features/reports/types.ts).
"""

from __future__ import annotations

from typing import Final, Literal

TERM_START: Final = "term_start"
TERM_END: Final = "term_end"
EXAM: Final = "exam"
HOLIDAY: Final = "holiday"
EVENT: Final = "event"

CalendarEventType = Literal["term_start", "term_end", "exam", "holiday", "event"]
