import type { Division } from "@/features/auth/types";

export type LessonPlanStatus =
  | "draft"
  | "submitted"
  | "unit_head_approved"
  | "approved"
  | "rejected";

export type LessonPlan = {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  division: Division;
  term: number;
  week: number;
  academicYear: string;
  topic: string | null;
  learningObjectives: string | null;
  teachingMethods: string | null;
  resources: string | null;
  assessmentPlan: string | null;
  fileUrl: string | null;
  status: LessonPlanStatus;
  reviewerComment: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateLessonPlanInput = {
  subjectId: string;
  classId: string;
  term: number;
  week: number;
  topic?: string;
  learningObjectives?: string;
  teachingMethods?: string;
  resources?: string;
  assessmentPlan?: string;
  fileUrl?: string;
};

export type UpdateLessonPlanInput = Partial<CreateLessonPlanInput>;

export type ReviewLessonPlanInput = {
  decision: "approve" | "reject";
  comment?: string;
};
