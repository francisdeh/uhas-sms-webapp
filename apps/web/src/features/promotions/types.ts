export const PROMOTION_SEASON_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
} as const;

export type PromotionSeasonStatus =
  (typeof PROMOTION_SEASON_STATUS)[keyof typeof PROMOTION_SEASON_STATUS];

export const PROMOTION_SUBMISSION_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  SENT_BACK: "sent_back",
} as const;

export type PromotionSubmissionStatus =
  (typeof PROMOTION_SUBMISSION_STATUS)[keyof typeof PROMOTION_SUBMISSION_STATUS];

export const PROMOTION_DECISION_KIND = {
  PROMOTE: "promote",
  REPEAT: "repeat",
  WITHDRAW: "withdraw",
  GRADUATE: "graduate",
} as const;

export type PromotionDecisionKind =
  (typeof PROMOTION_DECISION_KIND)[keyof typeof PROMOTION_DECISION_KIND];

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
  hasPublishedTerm3EndOfTerm: boolean;
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
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type PromotionComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string | null;
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
  comments: PromotionComment[];
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
