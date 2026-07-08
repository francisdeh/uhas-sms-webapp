import type { Division } from "@/features/auth/types";

export type SchemeType = "work" | "learning";
export type SchemeStatus = "draft" | "submitted" | "acknowledged";

export const SCHEME_TYPE_LABELS: Record<SchemeType, string> = {
  work: "Scheme of Work",
  learning: "Scheme of Learning",
};

export type SchemeComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string | null;
};

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
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: SchemeComment[];
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
