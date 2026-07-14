import type { Division } from "@/features/auth/types";

export type { Division } from "@/features/auth/types";

export type ClassTeacher = {
  staffId: string;
  staffName: string;
  isPrimary: boolean;
};

/** Fixed class-level catalogue — every class name implies a division, so
 *  create/edit forms pick from this list rather than typing name/division
 *  independently. Mirrors `apps/web/scripts/_seed-data/classes.ts`. */
export const CLASS_NAMES: Array<{ name: string; division: Division; slug: string }> = [
  { name: "KG 1", division: "KG", slug: "class-kg1" },
  { name: "KG 2", division: "KG", slug: "class-kg2" },
  { name: "Primary 1", division: "Lower Primary", slug: "class-p1" },
  { name: "Primary 2", division: "Lower Primary", slug: "class-p2" },
  { name: "Primary 3", division: "Lower Primary", slug: "class-p3" },
  { name: "Primary 4", division: "Upper Primary", slug: "class-p4" },
  { name: "Primary 5", division: "Upper Primary", slug: "class-p5" },
  { name: "Primary 6", division: "Upper Primary", slug: "class-p6" },
  { name: "JHS 1", division: "JHS", slug: "class-jhs1" },
  { name: "JHS 2", division: "JHS", slug: "class-jhs2" },
  { name: "JHS 3", division: "JHS", slug: "class-jhs3" },
];

export type SchoolClass = {
  id: string;
  schoolId: string;
  name: string;
  division: Division;
  academicYear: string;
  classTeachers: ClassTeacher[];
};

// Mirrors app/features/subjects/constants.py's category enum.
export const SUBJECT_CATEGORY = {
  CORE: "Core",
  ELECTIVE: "Elective",
  OPTIONAL: "Optional",
} as const;

export type SubjectCategory = (typeof SUBJECT_CATEGORY)[keyof typeof SUBJECT_CATEGORY];

export const SUBJECT_CATEGORIES: readonly SubjectCategory[] = [
  SUBJECT_CATEGORY.CORE,
  SUBJECT_CATEGORY.ELECTIVE,
  SUBJECT_CATEGORY.OPTIONAL,
];

export type Subject = {
  id: string;
  schoolId: string;
  name: string;
  division: Division | null;
  category: SubjectCategory;
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
