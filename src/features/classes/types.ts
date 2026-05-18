import type { Division } from "@/features/auth/types";

export type { Division } from "@/features/auth/types";

export type ClassTeacher = {
  staffId: string;
  staffName: string;
  isPrimary: boolean;
};

export type SchoolClass = {
  id: string;
  schoolId: string;
  name: string;
  division: Division;
  academicYear: string;
  classTeachers: ClassTeacher[];
};

export type Subject = {
  id: string;
  schoolId: string;
  name: string;
  division: Division | null;
  category: "Core" | "Elective";
};

export type ClassSubject = {
  classId: string;
  subjectId: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
};

export type CreateClassInput = {
  name: string;
  division: Division;
  academicYear: string;
};

export type CreateSubjectInput = {
  name: string;
  division: Division | null;
  category: "Core" | "Elective";
};

export type AssignTeacherInput = {
  teacherId: string | null;
};

export type AddClassSubjectInput = {
  subjectId: string;
};

export type AddClassTeacherInput = {
  staffId: string;
  isPrimary?: boolean;
};
