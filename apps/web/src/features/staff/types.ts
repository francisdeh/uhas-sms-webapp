import { UserRole, Division } from "@/features/auth/types";

export type StaffSystemRole = Exclude<UserRole, "Parent">;

/**
 * GES teacher-track ranks. Mirrors the FastAPI `TeacherRank` Literal
 * in `app/core/roles.py` — the two must stay in sync.
 */
export type TeacherRank = "Teacher" | "Senior Teacher" | "Principal Teacher";

export const TEACHER_RANKS: readonly TeacherRank[] = [
  "Teacher",
  "Senior Teacher",
  "Principal Teacher",
] as const;

export type Staff = {
  id: string;
  schoolId: string;
  uhasId: string | null;
  firstName: string;
  lastName: string;
  rank: TeacherRank | null;
  systemRole: StaffSystemRole;
  division: Division | null;
  isUnitHead: boolean;
  unitHeadOf: Division | null;
  photoUrl: string | null;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: string;
};

export type CreateStaffInput = {
  uhasId?: string;
  firstName: string;
  lastName: string;
  rank: TeacherRank | null;
  systemRole: StaffSystemRole;
  division?: Division;
  isUnitHead?: boolean;
  unitHeadOf?: Division;
  phone: string;
  email: string;
  photoUrl?: string;
};

export type UpdateStaffInput = {
  uhasId?: string;
  firstName?: string;
  lastName?: string;
  rank?: TeacherRank | null;
  phone?: string;
  email?: string;
  photoUrl?: string;
};

export type ChangeRoleInput = {
  systemRole: StaffSystemRole;
  division?: Division;
};

export type ToggleUnitHeadInput = {
  isUnitHead: boolean;
  unitHeadOf?: Division;
};

export type StaffRole = StaffSystemRole;
