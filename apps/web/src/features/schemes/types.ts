import type { Division } from "@/features/auth/types";

export type SchemeType = "work" | "learning";

// Mirrors app/features/schemes/constants.py's status enum.
export const SCHEME_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  ACKNOWLEDGED: "acknowledged",
} as const;

export type SchemeStatus = (typeof SCHEME_STATUS)[keyof typeof SCHEME_STATUS];

// Mirrors app/features/schemes/constants.py WORK / LEARNING.
export const WORK: SchemeType = "work";
export const LEARNING: SchemeType = "learning";
export const SCHEME_TYPES: readonly SchemeType[] = [WORK, LEARNING];

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

// Mirrors app/features/schemes/schema.py SchemeWeeklyEntryRead. One row
// per week in a Scheme of Learning's structured template — confirmed
// against a real sample template, not the FRD's aspirational field list.
export type SchemeWeeklyEntry = {
  id: string;
  week: number;
  strand: string | null;
  subStrand: string | null;
  contentStandard: string | null;
  indicators: string | null;
  resources: string | null;
  resourceFileUrls: string[];
  createdAt: string | null;
  updatedAt: string | null;
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
  entries: SchemeWeeklyEntry[];
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
