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
# A guardian was linked to / unlinked from a student (relationship change).
GUARDIAN_LINKED: Final = "GUARDIAN_LINKED"
GUARDIAN_UNLINKED: Final = "GUARDIAN_UNLINKED"
# A login (Supabase auth user + bridge row) was provisioned for a
# staff member or guardian.
USER_CREATED: Final = "USER_CREATED"
# A leave request was approved or rejected (not written for cancel —
# that's self-service, not a decision).
LEAVE_DECIDED: Final = "LEAVE_DECIDED"
# Admin flipped the school's active academic year (the "activate next
# year" rollover step) — distinct from SCHOOL_SETTINGS_UPDATE since this
# is a guarded, one-way-in-practice transition, not an ordinary field edit.
SCHOOL_YEAR_ACTIVATED: Final = "SCHOOL_YEAR_ACTIVATED"
# A promotion list was sent back to the submitting teacher for revision
# — the sibling of PROMOTION_APPROVED on the same review decision.
PROMOTION_SENT_BACK: Final = "PROMOTION_SENT_BACK"
# A lesson plan review decision (approve/reject at any stage of the
# Unit Head → Deputy Head chain).
LESSON_PLAN_REVIEWED: Final = "LESSON_PLAN_REVIEWED"
# Admin-driven edit of a staff member's own record fields (phone/email/
# rank/etc — not the role, which has its own ROLE_CHANGE).
STAFF_EDIT: Final = "STAFF_EDIT"
STAFF_DEACTIVATED: Final = "STAFF_DEACTIVATED"
STAFF_REACTIVATED: Final = "STAFF_REACTIVATED"
# Unit Head standing granted/revoked on a Teacher — review authority,
# same weight class as a role change but a distinct flag.
UNIT_HEAD_TOGGLED: Final = "UNIT_HEAD_TOGGLED"
STUDENT_DEACTIVATED: Final = "STUDENT_DEACTIVATED"
STUDENT_REACTIVATED: Final = "STUDENT_REACTIVATED"
# A student↔guardian link's relation/primary flag was edited in place
# (as opposed to GUARDIAN_LINKED/UNLINKED, which cover add/remove).
GUARDIAN_LINK_UPDATED: Final = "GUARDIAN_LINK_UPDATED"
# Admin-driven edit of a login's email/display name.
USER_EDIT: Final = "USER_EDIT"
# Admin-driven edit of a guardian's own record fields (phone/email/etc).
GUARDIAN_EDIT: Final = "GUARDIAN_EDIT"
ENROLLMENT_TRANSFERRED: Final = "ENROLLMENT_TRANSFERRED"
ENROLLMENT_STATUS_CHANGED: Final = "ENROLLMENT_STATUS_CHANGED"
# Fees domain — money mutations, previously entirely unaudited.
FEE_ITEM_UPDATED: Final = "FEE_ITEM_UPDATED"
LEARNER_FEE_UPDATED: Final = "LEARNER_FEE_UPDATED"
LEARNER_FEE_WAIVED: Final = "LEARNER_FEE_WAIVED"
LEARNER_FEE_EXCLUDED: Final = "LEARNER_FEE_EXCLUDED"
FEE_PAYMENT_RECORDED: Final = "FEE_PAYMENT_RECORDED"

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
    "GUARDIAN_LINKED",
    "GUARDIAN_UNLINKED",
    "USER_CREATED",
    "LEAVE_DECIDED",
    "SCHOOL_YEAR_ACTIVATED",
    "PROMOTION_SENT_BACK",
    "LESSON_PLAN_REVIEWED",
    "STAFF_EDIT",
    "STAFF_DEACTIVATED",
    "STAFF_REACTIVATED",
    "UNIT_HEAD_TOGGLED",
    "STUDENT_DEACTIVATED",
    "STUDENT_REACTIVATED",
    "GUARDIAN_LINK_UPDATED",
    "USER_EDIT",
    "GUARDIAN_EDIT",
    "ENROLLMENT_TRANSFERRED",
    "ENROLLMENT_STATUS_CHANGED",
    "FEE_ITEM_UPDATED",
    "LEARNER_FEE_UPDATED",
    "LEARNER_FEE_WAIVED",
    "LEARNER_FEE_EXCLUDED",
    "FEE_PAYMENT_RECORDED",
]
"""All audit_log.action values the API writes. Add new actions here
*and* on the TS side before introducing them."""
