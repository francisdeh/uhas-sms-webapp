export type AuditAction =
  | "SCORE_OVERRIDE"
  | "STUDENT_EDIT"
  | "ROLE_CHANGE"
  | "PROMOTION_APPROVED"
  | "SCHOOL_SETTINGS_UPDATE"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "ACCOUNT_SELF_DEACTIVATED"
  | "USER_MFA_RESET";

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
};
