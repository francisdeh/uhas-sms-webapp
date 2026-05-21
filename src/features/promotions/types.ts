export type PromotionSeasonStatus = "open" | "closed";

export type PromotionSubmissionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "sent_back";

export type PromotionDecisionKind = "promote" | "repeat" | "withdraw" | "graduate";

export type PromotionSeason = {
  id: string;
  schoolId: string;
  academicYear: string;
  status: PromotionSeasonStatus;
  openedWithOverride: boolean;
  openedById: string | null;
  openedByName: string | null;
  openedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  closedAt: string | null;
};

export type PromotionDecision = {
  id: string;
  submissionId: string;
  studentId: string;
  decision: PromotionDecisionKind;
  targetClassId: string | null;
  reason: string | null;
  suggestedDecision: PromotionDecisionKind | null;
  suggestedReason: string | null;
  failedCoreSubjects: number | null;
};

export type PromotionSubmission = {
  id: string;
  schoolId: string;
  classId: string;
  academicYear: string;
  status: PromotionSubmissionStatus;
  submittedById: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  reviewerComment: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type DecisionRowView = {
  decision: PromotionDecision;
  studentName: string;
  studentPhotoUrl: string | null;
};

export type PromotionSubmissionDetail = {
  submission: PromotionSubmission;
  className: string;
  division: string;
  nextAcademicYear: string;
  nextYearClasses: { id: string; name: string }[];
  decisions: DecisionRowView[];
  classTeachers: { staffId: string; staffName: string; isPrimary: boolean }[];
};

export type ClassOverviewRow = {
  classId: string;
  className: string;
  division: string;
  classTeachers: { staffId: string; staffName: string; isPrimary: boolean }[];
  totalStudents: number;
  decidedCount: number;
  submission: PromotionSubmission | null;
};
