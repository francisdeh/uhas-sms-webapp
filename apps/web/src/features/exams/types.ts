import type { Student } from "@/features/students/types";

export type ExamType = "MidTerm" | "EndOfTerm";

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

export type SubmissionStatus = "draft" | "submitted";

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
};
