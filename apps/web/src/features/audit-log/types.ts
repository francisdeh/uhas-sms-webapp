export type AuditAction =
  | "SCORE_OVERRIDE"
  | "STUDENT_EDIT"
  | "ROLE_CHANGE"
  | "PROMOTION_APPROVED"
  | "SCHOOL_SETTINGS_UPDATE"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "ACCOUNT_SELF_DEACTIVATED"
  | "USER_MFA_RESET"
  | "LEAVE_DECIDED"
  | "SCHOOL_YEAR_ACTIVATED"
  | "PROMOTION_SENT_BACK"
  | "LESSON_PLAN_REVIEWED"
  | "STAFF_EDIT"
  | "STAFF_DEACTIVATED"
  | "STAFF_REACTIVATED"
  | "UNIT_HEAD_TOGGLED"
  | "STUDENT_DEACTIVATED"
  | "STUDENT_REACTIVATED"
  | "GUARDIAN_LINK_UPDATED"
  | "USER_EDIT"
  | "GUARDIAN_EDIT"
  | "ENROLLMENT_TRANSFERRED"
  | "ENROLLMENT_STATUS_CHANGED"
  | "FEE_ITEM_UPDATED"
  | "LEARNER_FEE_UPDATED"
  | "LEARNER_FEE_WAIVED"
  | "LEARNER_FEE_EXCLUDED"
  | "FEE_PAYMENT_RECORDED";

export type AuditEventView = {
  id: string;
  userId: string;
  actorName: string | null;
  action: AuditAction;
  targetTable: string | null;
  targetId: string | null;
  before: unknown | null;
  after: unknown | null;
  createdAt: string;
};

export type AuditActor = {
  userId: string;
  name: string;
};

export type AuditFilters = {
  action: AuditAction | "all";
  userId: string | "all";
  targetTable: string | "all";
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  page: number; // 1-based
};

export const PAGE_SIZE = 50;

// Known real `target_table` values, mirrors app/features/*/service.py's
// `write_audit_log(...)` call sites — not a backend-enforced closed set
// (target_table is a free string column), just the realistic option
// list for the filter dropdown. Add here when a new domain starts
// writing audit rows.
export const AUDIT_TARGET_TABLES = [
  "school_terms",
  "students",
  "student_guardians",
  "promotion_submissions",
  "users",
  "exams",
  "scores",
  "class_report_submissions",
  "staff",
  "schools",
  "leave_requests",
  "guardians",
  "enrollments",
  "lesson_plans",
  "fee_items",
  "learner_fees",
] as const;

export const AUDIT_TARGET_TABLE_LABELS: Record<(typeof AUDIT_TARGET_TABLES)[number], string> = {
  school_terms: "School terms",
  students: "Students",
  student_guardians: "Student guardians",
  promotion_submissions: "Promotions",
  users: "Users",
  exams: "Exams",
  scores: "Scores",
  class_report_submissions: "Class report submissions",
  staff: "Staff",
  schools: "School settings",
  leave_requests: "Leave requests",
  guardians: "Guardians",
  enrollments: "Enrollments",
  lesson_plans: "Lesson plans",
  fee_items: "Fee items",
  learner_fees: "Learner fees",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  SCORE_OVERRIDE: "Score override",
  STUDENT_EDIT: "Student edit",
  ROLE_CHANGE: "Role change",
  PROMOTION_APPROVED: "Promotion approved",
  SCHOOL_SETTINGS_UPDATE: "School settings updated",
  USER_DEACTIVATED: "User deactivated",
  USER_REACTIVATED: "User reactivated",
  ACCOUNT_SELF_DEACTIVATED: "Account self-deactivated",
  USER_MFA_RESET: "2FA reset",
  LEAVE_DECIDED: "Leave decided",
  SCHOOL_YEAR_ACTIVATED: "Academic year activated",
  PROMOTION_SENT_BACK: "Promotion sent back",
  LESSON_PLAN_REVIEWED: "Lesson plan reviewed",
  STAFF_EDIT: "Staff edit",
  STAFF_DEACTIVATED: "Staff deactivated",
  STAFF_REACTIVATED: "Staff reactivated",
  UNIT_HEAD_TOGGLED: "Unit Head toggled",
  STUDENT_DEACTIVATED: "Student deactivated",
  STUDENT_REACTIVATED: "Student reactivated",
  GUARDIAN_LINK_UPDATED: "Guardian link updated",
  USER_EDIT: "User edit",
  GUARDIAN_EDIT: "Guardian edit",
  ENROLLMENT_TRANSFERRED: "Enrollment transferred",
  ENROLLMENT_STATUS_CHANGED: "Enrollment status changed",
  FEE_ITEM_UPDATED: "Fee item updated",
  LEARNER_FEE_UPDATED: "Learner fee updated",
  LEARNER_FEE_WAIVED: "Learner fee waived",
  LEARNER_FEE_EXCLUDED: "Learner fee excluded",
  FEE_PAYMENT_RECORDED: "Fee payment recorded",
};

export const AUDIT_ACTION_PILL: Record<AuditAction, string> = {
  SCORE_OVERRIDE: "bg-amber-100 text-amber-700",
  STUDENT_EDIT: "bg-blue-100 text-blue-700",
  ROLE_CHANGE: "bg-rose-100 text-rose-700",
  PROMOTION_APPROVED: "bg-green-100 text-green-700",
  SCHOOL_SETTINGS_UPDATE: "bg-slate-100 text-slate-700",
  USER_DEACTIVATED: "bg-rose-100 text-rose-700",
  USER_REACTIVATED: "bg-green-100 text-green-700",
  ACCOUNT_SELF_DEACTIVATED: "bg-rose-100 text-rose-700",
  USER_MFA_RESET: "bg-amber-100 text-amber-700",
  LEAVE_DECIDED: "bg-blue-100 text-blue-700",
  SCHOOL_YEAR_ACTIVATED: "bg-slate-100 text-slate-700",
  PROMOTION_SENT_BACK: "bg-amber-100 text-amber-700",
  LESSON_PLAN_REVIEWED: "bg-blue-100 text-blue-700",
  STAFF_EDIT: "bg-blue-100 text-blue-700",
  STAFF_DEACTIVATED: "bg-rose-100 text-rose-700",
  STAFF_REACTIVATED: "bg-green-100 text-green-700",
  UNIT_HEAD_TOGGLED: "bg-rose-100 text-rose-700",
  STUDENT_DEACTIVATED: "bg-rose-100 text-rose-700",
  STUDENT_REACTIVATED: "bg-green-100 text-green-700",
  GUARDIAN_LINK_UPDATED: "bg-blue-100 text-blue-700",
  USER_EDIT: "bg-blue-100 text-blue-700",
  GUARDIAN_EDIT: "bg-blue-100 text-blue-700",
  ENROLLMENT_TRANSFERRED: "bg-blue-100 text-blue-700",
  ENROLLMENT_STATUS_CHANGED: "bg-blue-100 text-blue-700",
  FEE_ITEM_UPDATED: "bg-amber-100 text-amber-700",
  LEARNER_FEE_UPDATED: "bg-amber-100 text-amber-700",
  LEARNER_FEE_WAIVED: "bg-rose-100 text-rose-700",
  LEARNER_FEE_EXCLUDED: "bg-rose-100 text-rose-700",
  FEE_PAYMENT_RECORDED: "bg-green-100 text-green-700",
};
