"""Closed set of `notifications.kind` values.

Every notification-producing code path chooses one of these. Adding a
new kind means: (1) add the Final constant here, (2) add the string
literal to `NotificationKind`, (3) wire the producer in a domain
service. The TS side keeps a matching union in
[apps/web/src/features/notifications/types.ts](../../../../web/src/features/notifications/types.ts)
— mirror both when adding.

Kinds are grouped by producer domain for readability, but the `kind`
column has no domain FK — it's a free string on the DB side and the
Literal here is the only closed set.
"""

from __future__ import annotations

from typing import Final, Literal

# ─── Lesson plans + schemes ─────────────────────────────────────────────────
LESSON_PLAN_SUBMITTED: Final = "lesson_plan_submitted"
LESSON_PLAN_REVIEWED: Final = "lesson_plan_reviewed"
LESSON_PLAN_ADVANCED: Final = "lesson_plan_advanced"
SCHEME_SUBMITTED: Final = "scheme_submitted"
SCHEME_ACKNOWLEDGED: Final = "scheme_acknowledged"

# ─── Announcements ──────────────────────────────────────────────────────────
ANNOUNCEMENT_POSTED: Final = "announcement_posted"

# ─── Attendance + exams ─────────────────────────────────────────────────────
ATTENDANCE_ABSENT: Final = "attendance_absent"
RESULTS_PUBLISHED: Final = "results_published"

# ─── Leave requests ─────────────────────────────────────────────────────────
LEAVE_REQUEST_SUBMITTED: Final = "leave_request_submitted"
LEAVE_REQUEST_DECIDED: Final = "leave_request_decided"

# ─── Promotions ─────────────────────────────────────────────────────────────
PROMOTION_SEASON_OPENED: Final = "promotion_season_opened"
PROMOTION_SENT_BACK: Final = "promotion_sent_back"

# ─── Assignments ────────────────────────────────────────────────────────────
ASSIGNMENT_CREATED: Final = "assignment_created"


NotificationKind = Literal[
    "lesson_plan_submitted",
    "lesson_plan_reviewed",
    "lesson_plan_advanced",
    "scheme_submitted",
    "scheme_acknowledged",
    "announcement_posted",
    "attendance_absent",
    "results_published",
    "leave_request_submitted",
    "leave_request_decided",
    "promotion_season_opened",
    "promotion_sent_back",
    "assignment_created",
]
