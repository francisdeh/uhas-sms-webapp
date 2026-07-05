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
