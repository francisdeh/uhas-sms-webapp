export type UserRole = "Admin" | "DeputyHead" | "Teacher" | "Parent" | "Accountant";

// Mirrors app/core/roles.py's individual Final constants (ADMIN,
// DEPUTY_HEAD, etc). Use these instead of comparing against bare
// string literals like `role === "DeputyHead"`.
export const ADMIN: UserRole = "Admin";
export const DEPUTY_HEAD: UserRole = "DeputyHead";
export const TEACHER: UserRole = "Teacher";
export const PARENT: UserRole = "Parent";
export const ACCOUNTANT: UserRole = "Accountant";

export const USER_ROLES: UserRole[] = ["Admin", "DeputyHead", "Teacher", "Parent", "Accountant"];

// Subset of UserRole that excludes Parent. Used wherever a query needs to
// filter for *staff-side* records (e.g. notification audience resolution,
// staff system-role columns in the DB) and for z.enum() shared schemas.
// Prefer this over inline casts like `as "Admin" | "DeputyHead" | "Teacher"`.
//
// Declared as a `readonly` tuple via `as const` so it doubles as a
// `z.enum()`-compatible literal — pass it directly into Zod schemas.
export const STAFF_SYSTEM_ROLES = ["Admin", "DeputyHead", "Teacher", "Accountant"] as const;
export type StaffSystemRole = (typeof STAFF_SYSTEM_ROLES)[number];

export type SessionUser = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
  /** Human-readable id ("STAFF-001") for the linked staff/guardian row — display only. */
  slug: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  isUnitHead?: boolean;
  unitHeadOf?: Division | null;
  emailOnLessonPlanRejected: boolean;
  emailOnResultsPublished: boolean;
  emailOnAppointmentActivity: boolean;
  smsOnAppointmentActivity: boolean;
  emailOnAppointmentDecided: boolean;
  smsOnAppointmentDecided: boolean;
  emailOnLeaveActivity: boolean;
  smsOnLeaveActivity: boolean;
  emailOnLeaveDecided: boolean;
  smsOnLeaveDecided: boolean;
};

export const ROLE_DASHBOARD: Record<UserRole, string> = {
  Admin: "/admin",
  DeputyHead: "/deputy-head",
  Teacher: "/teacher",
  Parent: "/parent",
  Accountant: "/accountant",
};

// Single source of truth for role display text — every UI surface that
// shows a role to a human (tables, dropdowns, badges) imports this
// rather than hand-rolling its own "DeputyHead" -> "Deputy Head" mapping.
export const ROLE_LABELS: Record<UserRole, string> = {
  Admin: "Admin",
  DeputyHead: "Deputy Head",
  Teacher: "Teacher",
  Parent: "Parent",
  Accountant: "Accountant",
};

export type Division = "KG" | "Lower Primary" | "Upper Primary" | "JHS";

export const DIVISIONS: Division[] = ["KG", "Lower Primary", "Upper Primary", "JHS"];

export const KG: Division = "KG";
export const LOWER_PRIMARY: Division = "Lower Primary";
export const UPPER_PRIMARY: Division = "Upper Primary";
export const JHS: Division = "JHS";

export type ManagedUser = {
  uid: string;
  email: string | null;
  displayName: string;
  role: UserRole;
  linkedId: string;
  /** Human-readable id ("STAFF-001") for the linked staff/guardian row — display only. */
  slug: string | null;
  isActive: boolean;
  photoUrl: string | null;
};
