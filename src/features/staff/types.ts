import { UserRole } from "@/features/auth/types";

export type StaffSystemRole = Exclude<UserRole, "Parent">;

export type Staff = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  rank: string;
  systemRole: StaffSystemRole;
  division: "KG" | "Primary" | "JHS" | null;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

export type CreateStaffInput = {
  firstName: string;
  lastName: string;
  rank: string;
  systemRole: StaffSystemRole;
  division?: "KG" | "Primary" | "JHS";
  phone: string;
  email: string;
};

export type UpdateStaffInput = {
  firstName?: string;
  lastName?: string;
  rank?: string;
  phone?: string;
  email?: string;
};

export type ChangeRoleInput = {
  systemRole: StaffSystemRole;
  division?: "KG" | "Primary" | "JHS";
};

export type StaffRole = StaffSystemRole;
