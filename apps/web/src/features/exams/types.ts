import type { Student } from "@/features/students/types";

export const EXAM_TYPE = {
  MID_TERM: "MidTerm",
  END_OF_TERM: "EndOfTerm",
} as const;

export type ExamType = (typeof EXAM_TYPE)[keyof typeof EXAM_TYPE];

export const EXAM_TYPES: readonly ExamType[] = [EXAM_TYPE.MID_TERM, EXAM_TYPE.END_OF_TERM];

// The school year is fixed at 3 terms — mirrors term_resolver.py's term range.
export const TERMS: readonly number[] = [1, 2, 3];

// One row of the school's grade-band table + the score-component
// weighting — mirrors `apps/api/app/features/schools/schema.py`'s
// `GradingBand`/`ScoreWeights`. Duplicated locally (rather than
// imported from features/settings) to keep exams' domain shapes
// self-contained; same precedent as GradingTab.tsx's local GES_BANDS copy.
export type GradingBand = {
  min: number;
  max: number;
  grade: string;
  interpretation: string;
};

export type ScoreWeights = {
  exam: number;
  cat1: number;
  cat2: number;
  groupWork: number;
  projectWork: number;
};

export type Exam = {
  id: string;
  schoolId: string;
  name: string;
  type: ExamType;
  term: number;
  academicYear: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
};

export type Score = {
  id: string;
  examId: string;
  studentId: string;
  subjectId: string;
  cat1: number | null;
  cat2: number | null;
  projectWork: number | null;
  groupWork: number | null;
  examScore: number | null;
  totalScore: number | null;
  grade: string | null;
  interpretation: string | null;
  subjectPosition: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ScoreInput = {
  studentId: string;
  cat1?: number | null;
  cat2?: number | null;
  projectWork?: number | null;
  groupWork?: number | null;
  examScore?: number | null;
};

export type CreateExamInput = {
  name: string;
  type: ExamType;
  term: number;
  academicYear: string;
};

export type ScoreRow = Score & {
  studentName: string;
};

export type StudentExamSummary = {
  studentId: string;
  studentName: string;
  scores: Score[];
  aggregate: number | null;
};

export const CLASS_REPORT_SUBMISSION_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
} as const;

export type SubmissionStatus =
  (typeof CLASS_REPORT_SUBMISSION_STATUS)[keyof typeof CLASS_REPORT_SUBMISSION_STATUS];

export type ClassReportSubmission = {
  id: string;
  examId: string;
  classId: string;
  status: SubmissionStatus;
  submittedById: string | null;
  submittedAt: string | null;
};

export type StudentRemark = {
  examId: string;
  studentId: string;
  classTeacherRemark: string | null;
  headOfSchoolComment: string | null;
  updatedAt: string;
};

export type SubmitClassReportInput = {
  examId: string;
  classId: string;
  remarks: { studentId: string; classTeacherRemark: string }[];
};

export type ReportCardSubjectRow = {
  subjectId: string;
  subjectName: string;
  category: "Core" | "Elective";
  cat1: number | null;
  cat2: number | null;
  projectWork: number | null;
  groupWork: number | null;
  examScore: number | null;
  totalScore: number | null;
  grade: string | null;
  interpretation: string | null;
  subjectPosition: number | null;
  classAverage: number | null;
};

// Mirrors apps/api/app/features/exams/constants.py's KG_DOMAINS/
// CONDUCT_TRAITS/Rating — fixed lists, no per-school customisation.
export const RATINGS = ["Excellent", "Good", "Needs Improvement"] as const;
export type Rating = (typeof RATINGS)[number];

export const KG_DOMAINS = [
  "language",
  "numeracy",
  "social_skills",
  "physical_motor",
  "creative_arts",
] as const;
export type KgDomain = (typeof KG_DOMAINS)[number];

export const KG_DOMAIN_LABELS: Record<KgDomain, string> = {
  language: "Language Development",
  numeracy: "Numeracy",
  social_skills: "Social Skills",
  physical_motor: "Physical / Motor Skills",
  creative_arts: "Creative Arts",
};

export const CONDUCT_TRAITS = [
  "punctuality",
  "neatness",
  "honesty",
  "relationship_with_others",
] as const;
export type ConductTrait = (typeof CONDUCT_TRAITS)[number];

export const CONDUCT_TRAIT_LABELS: Record<ConductTrait, string> = {
  punctuality: "Punctuality",
  neatness: "Neatness",
  honesty: "Honesty",
  relationship_with_others: "Relationship with Others",
};

export type ReportCardData = {
  exam: Exam;
  student: Student;
  className: string;
  numberOnRoll: number;
  coreRows: ReportCardSubjectRow[];
  electiveRows: ReportCardSubjectRow[];
  gradingBands: GradingBand[];
  aggregate: number | null;
  attendance: { attended: number; total: number };
  classTeacherNames: string[];
  classTeacherRemark: string | null;
  headOfSchoolComment: string | null;
  kgObservations: Partial<Record<KgDomain, Rating>> | null;
  conductRatings: Partial<Record<ConductTrait, Rating>> | null;
  interestsCoCurricular: string | null;
  vacationDate: string | null;
  reopeningDate: string | null;
};

export const BATCH_JOB_STATUS = {
  PENDING: "pending",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export type BatchJobStatus = (typeof BATCH_JOB_STATUS)[keyof typeof BATCH_JOB_STATUS];

export type ReportCardBatchJob = {
  id: string;
  examId: string;
  classId: string;
  status: BatchJobStatus;
  downloadUrl: string | null;
  errorMessage: string | null;
};

export const REPORT_CARD_VARIANT = {
  SUMMARY: "summary",
  FULL: "full",
} as const;

export type ReportCardVariant = (typeof REPORT_CARD_VARIANT)[keyof typeof REPORT_CARD_VARIANT];

export const SCORE_ENTRY_STATUS = {
  NOT_STARTED: "not_started",
  PARTIAL: "partial",
  COMPLETE: "complete",
} as const;

export type ScoreEntryStatus = (typeof SCORE_ENTRY_STATUS)[keyof typeof SCORE_ENTRY_STATUS];

export type ScoreCompletenessRow = {
  subjectId: string;
  subjectName: string;
  teacherId?: string | null;
  teacherName?: string | null;
  enteredCount: number;
  rosterCount: number;
  status: ScoreEntryStatus;
};
