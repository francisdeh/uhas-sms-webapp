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
  slug: string;
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
  hireDate: string | null;
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
  hireDate?: string;
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

// Which subjects a staff member is qualified to teach — distinct from
// class assignment. Open read; PUT (full-replace) is Admin only.
export type SubjectExpertise = {
  id: string;
  slug: string;
  name: string;
};

export type Qualification = {
  id: string;
  staffId: string;
  name: string;
  institution?: string | null;
  yearObtained?: number | null;
  createdAt?: string | null;
};

export type CreateQualificationInput = {
  name: string;
  institution?: string;
  yearObtained?: number;
};

// Mirrors app/features/staff/constants.py DocumentLabel.
export const STAFF_DOCUMENT_LABELS = [
  "Certificate",
  "Contract",
  "National ID",
  "CV",
  "Other",
] as const;

export type StaffDocumentLabel = (typeof STAFF_DOCUMENT_LABELS)[number];

// GET /staff/{id}/documents — gated tighter than the rest of this
// feature's open-read precedent (Admin any, staff their own only).
export type StaffDocument = {
  id: string;
  staffId: string;
  label: StaffDocumentLabel;
  otherLabel?: string | null;
  storagePath: string;
  uploadedById: string;
  uploadedByName: string;
  createdAt?: string | null;
};

export type CreateStaffDocumentInput = {
  label: StaffDocumentLabel;
  otherLabel?: string;
  storagePath: string;
};
