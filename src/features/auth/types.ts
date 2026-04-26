export type UserRole = "Admin" | "DeputyHead" | "HOD" | "Teacher" | "Parent";

export type SessionUser = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
  mustChangePassword: boolean;
};

export const ROLE_DASHBOARD: Record<UserRole, string> = {
  Admin: "/admin",
  DeputyHead: "/deputy-head",
  HOD: "/hod",
  Teacher: "/teacher",
  Parent: "/parent",
};
