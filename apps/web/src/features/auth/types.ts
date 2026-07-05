export type UserRole = "Admin" | "DeputyHead" | "Teacher" | "Parent" | "Accountant";

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
  mustChangePassword: boolean;
  isUnitHead?: boolean;
  unitHeadOf?: Division | null;
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

export type ManagedUser = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
  /** Human-readable id ("STAFF-001") for the linked staff/guardian row — display only. */
  slug: string | null;
  isActive: boolean;
  photoUrl: string | null;
};
