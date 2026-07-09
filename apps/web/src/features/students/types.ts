import type { Division } from "@/features/auth/types";

export type Student = {
  id: string;
  slug: string;
  schoolId: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dob: string;
  gender: "Male" | "Female";
  classId: string;
  className: string;
  division: Division;
  phone?: string;
  address?: string;
  nationality?: string;
  religion?: string;
  photoUrl?: string;
  isActive: boolean;
  createdAt: string;
};

export type CreateStudentInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  dob: string;
  gender: "Male" | "Female";
  classId: string;
  phone?: string;
  address?: string;
  nationality?: string;
  religion?: string;
  photoUrl?: string;
};

export type UpdateStudentInput = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dob?: string;
  gender?: "Male" | "Female";
  phone?: string;
  address?: string;
  nationality?: string;
  religion?: string;
  photoUrl?: string;
};

export type TransferStudentInput = {
  classId: string;
};

export type ClassRecord = {
  id: string;
  name: string;
  division: Division;
};

export type GuardianProfile = {
  id: string;
  slug: string;
  name: string;
  relationship: string;
  phone?: string;
  email?: string;
};

// Mirrors app/features/guardians/constants.py RELATION_TYPES.
export const RELATION_TYPES = [
  "Mother",
  "Father",
  "Guardian",
  "Grandparent",
  "Aunt",
  "Uncle",
  "Other",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export type GuardianLink = {
  id: string;
  slug: string;
  name: string;
  relationship: string;
  isPrimary: boolean;
  hasLogin: boolean;
  isStaff: boolean;
  phone?: string | null;
  email?: string | null;
};

export type Sibling = {
  id: string;
  slug: string;
  name: string;
  className?: string | null;
};

// Mirrors app/features/students/constants.py BloodType.
export const BLOOD_TYPES = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "Unknown",
] as const;

export type BloodType = (typeof BLOOD_TYPES)[number];

// GET/PATCH /students/{id}/medical — a separately-gated endpoint, not
// part of the base Student read (see StudentMedicalRead's backend
// docstring: the base student read has no ownership gate, so medical
// info can't live there without leaking to any authenticated user).
export type Medical = {
  bloodType: BloodType | null;
  medicalNotes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

export type MedicalUpdateInput = {
  bloodType?: BloodType | null;
  medicalNotes?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
};

// Mirrors app/features/students/constants.py DocumentLabel.
export const DOCUMENT_LABELS = [
  "Birth Certificate",
  "Ghana Card",
  "Immunization Record",
  "Transfer Letter",
  "Passport Photo",
  "Other",
] as const;

export type DocumentLabel = (typeof DOCUMENT_LABELS)[number];

export type StudentDocument = {
  id: string;
  studentId: string;
  label: DocumentLabel;
  otherLabel?: string | null;
  storagePath: string;
  uploadedById: string;
  uploadedByName: string;
  createdAt?: string | null;
};

export type CreateStudentDocumentInput = {
  label: DocumentLabel;
  otherLabel?: string;
  storagePath: string;
};
