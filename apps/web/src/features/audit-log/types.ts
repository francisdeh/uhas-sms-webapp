export type AuditAction =
  | "SCORE_OVERRIDE"
  | "STUDENT_EDIT"
  | "ROLE_CHANGE"
  | "PROMOTION_APPROVED"
  | "SCHOOL_SETTINGS_UPDATE"
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "ACCOUNT_SELF_DEACTIVATED";

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

export type AuditFilters = {
  action: AuditAction | "all";
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  page: number; // 1-based
};

export const PAGE_SIZE = 50;

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  SCORE_OVERRIDE: "Score override",
  STUDENT_EDIT: "Student edit",
  ROLE_CHANGE: "Role change",
  PROMOTION_APPROVED: "Promotion approved",
  SCHOOL_SETTINGS_UPDATE: "School settings updated",
  USER_DEACTIVATED: "User deactivated",
  USER_REACTIVATED: "User reactivated",
  ACCOUNT_SELF_DEACTIVATED: "Account self-deactivated",
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
};
