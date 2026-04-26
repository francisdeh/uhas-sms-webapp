export type Student = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: "Male" | "Female";
  classId: string;
  className: string;
  division: "KG" | "Primary" | "JHS";
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
  lastName: string;
  dob: string;
  gender: "Male" | "Female";
  classId: string;
  phone?: string;
  address?: string;
  nationality?: string;
  religion?: string;
};

export type UpdateStudentInput = {
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: "Male" | "Female";
  phone?: string;
  address?: string;
  nationality?: string;
  religion?: string;
};

export type TransferStudentInput = {
  classId: string;
};
