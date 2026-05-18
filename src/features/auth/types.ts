export type UserRole = "Admin" | "DeputyHead" | "Teacher" | "Parent";

export const USER_ROLES: UserRole[] = ["Admin", "DeputyHead", "Teacher", "Parent"];

export type SessionUser = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
  mustChangePassword: boolean;
  isUnitHead?: boolean;
  unitHeadOf?: Division | null;
};

export const ROLE_DASHBOARD: Record<UserRole, string> = {
  Admin: "/admin",
  DeputyHead: "/deputy-head",
  Teacher: "/teacher",
  Parent: "/parent",
};

export type Division = "KG" | "Lower Primary" | "Upper Primary" | "JHS";

export const DIVISIONS: Division[] = ["KG", "Lower Primary", "Upper Primary", "JHS"];
