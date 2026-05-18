import type { Division } from "@/features/auth/types";

export type SchemeType = "work" | "learning";
export type SchemeStatus = "draft" | "submitted" | "acknowledged";

export type Scheme = {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  division: Division;
  type: SchemeType;
  term: number;
  academicYear: string;
  title: string;
  fileUrl: string | null;
  content: string | null;
  status: SchemeStatus;
  reviewerComment: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateSchemeInput = {
  type: SchemeType;
  subjectId: string;
  classId: string;
  term: number;
  title: string;
  fileUrl?: string;
  content?: string;
};

export type UpdateSchemeInput = Partial<CreateSchemeInput>;
