"""Closed set of audit_log.action values.

Every audited mutation references one of these — the constants make
typos impossible and the `AuditAction` Literal type drives autocomplete
+ exhaustiveness in switch / match constructs.

The TS side keeps a *curated subset* of these for its audit-log filter
UI at
[apps/web/src/features/audit-log/types.ts](../../../../web/src/features/audit-log/types.ts)
(labels + filter pills). Add a new action there too if it should be
filterable / nicely labelled in the admin audit-log view; rows for an
action absent from that subset still render, just without a label.
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
# Account activation state. USER_* are admin-initiated (admin toggling
# another account); ACCOUNT_SELF_DEACTIVATED is a user deactivating
# their own account from the Profile page.
USER_DEACTIVATED: Final = "USER_DEACTIVATED"
USER_REACTIVATED: Final = "USER_REACTIVATED"
ACCOUNT_SELF_DEACTIVATED: Final = "ACCOUNT_SELF_DEACTIVATED"
# Admin cleared a user's 2FA factors (lockout recovery — Supabase has no
# backup codes, so an admin reset is the way back in).
USER_MFA_RESET: Final = "USER_MFA_RESET"

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
    "USER_DEACTIVATED",
    "USER_REACTIVATED",
    "ACCOUNT_SELF_DEACTIVATED",
    "USER_MFA_RESET",
]
"""All audit_log.action values the API writes. Add new actions here
*and* on the TS side before introducing them."""
