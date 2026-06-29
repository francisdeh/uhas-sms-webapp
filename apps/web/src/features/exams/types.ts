export type ExamType = "MidTerm" | "EndOfTerm";

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
