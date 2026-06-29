import type { AuditAction } from "@/lib/audit-log";

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
};

export const AUDIT_ACTION_PILL: Record<AuditAction, string> = {
  SCORE_OVERRIDE: "bg-amber-100 text-amber-700",
  STUDENT_EDIT: "bg-blue-100 text-blue-700",
  ROLE_CHANGE: "bg-rose-100 text-rose-700",
  PROMOTION_APPROVED: "bg-green-100 text-green-700",
  SCHOOL_SETTINGS_UPDATE: "bg-slate-100 text-slate-700",
};
