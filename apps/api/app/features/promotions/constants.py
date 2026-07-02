"""Closed sets of status/decision values used across the Promotions domain.

Three orthogonal state machines live here:

  1. Season lifecycle (`promotion_seasons.status`)
       closed ──open──► open ──close──► closed
     There's at most one row per (school, academic_year); opening the
     season unlocks all downstream writes for that year.

  2. Submission lifecycle (`promotion_submissions.status`) — per class
       draft ──submit──► submitted ──approve──► approved
                            └──send_back──► sent_back ──edit──► draft
     Once approved a submission is terminal for the year — the transactional
     `approve` step materialises enrolments and can't be safely rolled back
     via the UI.

  3. Individual decision (`promotion_decisions.decision`) — per student
       promote | repeat | withdraw | graduate

Notes:
  * `graduate` is auto-suggested for JHS 3 rows; other classes get
    `promote` or `repeat` depending on failed-core-subject count.
  * `withdraw` is always a human override; there's no auto-suggestion for it.
"""

from __future__ import annotations

from typing import Final, Literal

# Season
SEASON_OPEN: Final = "open"
SEASON_CLOSED: Final = "closed"
SeasonStatus = Literal["open", "closed"]

# Submission
SUB_DRAFT: Final = "draft"
SUB_SUBMITTED: Final = "submitted"
SUB_APPROVED: Final = "approved"
SUB_SENT_BACK: Final = "sent_back"
SubmissionStatus = Literal["draft", "submitted", "approved", "sent_back"]

# Decision
DEC_PROMOTE: Final = "promote"
DEC_REPEAT: Final = "repeat"
DEC_WITHDRAW: Final = "withdraw"
DEC_GRADUATE: Final = "graduate"
DecisionKind = Literal["promote", "repeat", "withdraw", "graduate"]

# Enrolment status values written during `approve`. `Active` = normal
# enrolment, `Completed` = closed last year's enrolment, `Repeating` =
# same class re-enrolled next year.
ENROLLMENT_ACTIVE: Final = "Active"
ENROLLMENT_COMPLETED: Final = "Completed"
ENROLLMENT_REPEATING: Final = "Repeating"
