export type Division = "KG" | "Primary" | "JHS";

export type SchoolClass = {
  id: string;
  schoolId: string;
  name: string;
  division: Division;
  academicYear: string;
  classTeacherId: string | null;
  classTeacherName: string | null;
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
