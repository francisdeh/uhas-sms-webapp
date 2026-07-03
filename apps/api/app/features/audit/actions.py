"""Closed set of audit_log.action values.

Every audited mutation references one of these — the constants make
typos impossible and the `AuditAction` Literal type drives autocomplete
+ exhaustiveness in switch / match constructs.

Keep this in sync with the TS-side equivalent at
[apps/web/src/lib/audit-log.ts](../../../../web/src/lib/audit-log.ts).
Both layers write into the same `audit_log` table, so a typo on
either side produces silent drift in queries that filter by action.
"""

from __future__ import annotations

from typing import Final, Literal

# Each constant's value is the literal string written to the column.
# String content must NOT change — historical rows reference these
# names and downstream queries filter on them.
EXAM_PUBLISH: Final = "EXAM_PUBLISH"
EXAM_UNPUBLISH: Final = "EXAM_UNPUBLISH"
SCORE_OVERRIDE: Final = "SCORE_OVERRIDE"
STUDENT_EDIT: Final = "STUDENT_EDIT"
ROLE_CHANGE: Final = "ROLE_CHANGE"
PROMOTION_APPROVED: Final = "PROMOTION_APPROVED"
SCHOOL_SETTINGS_UPDATE: Final = "SCHOOL_SETTINGS_UPDATE"
SCHOOL_TERMS_UPSERT: Final = "SCHOOL_TERMS_UPSERT"
CLASS_REPORT_HOS_COMMENT_UPDATED: Final = "CLASS_REPORT_HOS_COMMENT_UPDATED"

AuditAction = Literal[
    "EXAM_PUBLISH",
    "EXAM_UNPUBLISH",
    "SCORE_OVERRIDE",
    "STUDENT_EDIT",
    "ROLE_CHANGE",
    "PROMOTION_APPROVED",
    "SCHOOL_SETTINGS_UPDATE",
    "SCHOOL_TERMS_UPSERT",
    "CLASS_REPORT_HOS_COMMENT_UPDATED",
]
"""All audit_log.action values the API writes. Add new actions here
*and* on the TS side before introducing them."""
