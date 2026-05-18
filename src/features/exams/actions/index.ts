"use server";

import { mockExams } from "@/lib/mock/exams";
import { mockScores } from "@/lib/mock/scores";
import { mockStudents } from "@/lib/mock/students";
import { mockClasses } from "@/lib/mock/classes";
import { mockClassSubjects } from "@/lib/mock/class-subjects";
import {
  mockClassReportSubmissions,
  mockStudentRemarks,
} from "@/lib/mock/class-reports";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type {
  Exam,
  ExamType,
  Score,
  ScoreInput,
  CreateExamInput,
  ClassReportSubmission,
  StudentRemark,
  SubmitClassReportInput,
} from "@/features/exams/types";
import {
  computeTotalScore,
  computeGrade,
  assignSubjectPositions,
  hasAnyComponentScore,
} from "@/features/exams/utils";

type ActionResult = { success: true } | { success: false; error: string };

// All write-through to the mock arrays directly so queries that read the
// imported fixtures (e.g. the report card query) see the latest state.
const exams = mockExams;
const scores = mockScores;
const submissions = mockClassReportSubmissions;
const remarks = mockStudentRemarks;

export async function listExamsAction(filter?: {
  type?: ExamType;
  term?: number;
  academicYear?: string;
  isPublished?: boolean;
}): Promise<Exam[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];

  // Default to the user's currently-selected academic year when not specified.
  const year = filter?.academicYear ?? (await getCurrentAcademicYear());

  let results = [...exams];
  if (filter?.type) results = results.filter((e) => e.type === filter.type);
  if (filter?.term) results = results.filter((e) => e.term === filter.term);
  results = results.filter((e) => e.academicYear === year);
  if (filter?.isPublished !== undefined)
    results = results.filter((e) => e.isPublished === filter.isPublished);

  return results.sort((a, b) => {
    if (a.academicYear !== b.academicYear) return b.academicYear.localeCompare(a.academicYear);
    if (a.term !== b.term) return b.term - a.term;
    if (a.type !== b.type) return a.type === "MidTerm" ? -1 : 1;
    return 0;
  });
}

export async function getExamAction(id: string): Promise<Exam | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  return exams.find((e) => e.id === id) ?? null;
}

export async function createExamAction(
  input: CreateExamInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }

  const duplicate = exams.find(
    (e) =>
      e.type === input.type &&
      e.term === input.term &&
      e.academicYear === input.academicYear
  );
  if (duplicate) {
    return { success: false, error: "An exam of this type already exists for this term." };
  }

  const id = `exam-${input.type.toLowerCase()}-t${input.term}-${input.academicYear.replace("/", "-")}-${Date.now()}`;
  exams.push({
    id,
    schoolId: "school-uhas-001",
    name: input.name,
    type: input.type,
    term: input.term,
    academicYear: input.academicYear,
    isPublished: false,
    publishedAt: null,
    createdAt: new Date().toISOString(),
  });

  return { success: true, id };
}

export async function publishExamAction(id: string): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }

  const exam = exams.find((e) => e.id === id);
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Already published." };

  exam.isPublished = true;
  exam.publishedAt = new Date().toISOString();
  return { success: true };
}

export async function unpublishExamAction(id: string): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }
  const exam = exams.find((e) => e.id === id);
  if (!exam) return { success: false, error: "Exam not found." };
  exam.isPublished = false;
  exam.publishedAt = null;
  return { success: true };
}

// Returns scores for one (exam, subject, class) grid plus the roster of students.
export async function getScoresForGridAction(input: {
  examId: string;
  subjectId: string;
  classId: string;
}): Promise<{
  exam: Exam | null;
  rows: { studentId: string; studentName: string; score: Score | null }[];
}> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { exam: null, rows: [] };
  }

  const exam = exams.find((e) => e.id === input.examId) ?? null;
  const roster = mockStudents
    .filter((s) => s.classId === input.classId && s.isActive)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  const rows = roster.map((s) => ({
    studentId: s.id,
    studentName: `${s.firstName} ${s.lastName}`,
    score:
      scores.find(
        (sc) =>
          sc.examId === input.examId &&
          sc.subjectId === input.subjectId &&
          sc.studentId === s.id
      ) ?? null,
  }));

  return { exam, rows };
}

export async function saveScoresAction(input: {
  examId: string;
  subjectId: string;
  classId: string;
  rows: ScoreInput[];
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }

  const exam = exams.find((e) => e.id === input.examId);
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) {
    return {
      success: false,
      error: "Exam is published. Unpublish first to edit scores.",
    };
  }

  // Validate ranges 0-100
  for (const row of input.rows) {
    const fields = ["cat1", "cat2", "projectWork", "groupWork", "examScore"] as const;
    for (const f of fields) {
      const v = row[f];
      if (v != null && (v < 0 || v > 100)) {
        return { success: false, error: `${f} must be between 0 and 100.` };
      }
    }
  }

  // Compute total + grade per row, drop rows without any component
  const computed = input.rows.map((row) => {
    const components = {
      cat1: row.cat1 ?? null,
      cat2: row.cat2 ?? null,
      projectWork: row.projectWork ?? null,
      groupWork: row.groupWork ?? null,
      examScore: row.examScore ?? null,
    };
    const totalScore = hasAnyComponentScore(components)
      ? computeTotalScore(exam.type, components)
      : null;
    const graded = totalScore != null ? computeGrade(totalScore) : null;
    return {
      studentId: row.studentId,
      ...components,
      totalScore,
      grade: graded?.grade ?? null,
      interpretation: graded?.interpretation ?? null,
    };
  });

  // Drop existing scores for this (exam, subject) ↔ each student we're saving
  const studentIds = new Set(computed.map((c) => c.studentId));
  for (let i = scores.length - 1; i >= 0; i--) {
    const s = scores[i];
    if (s.examId === input.examId && s.subjectId === input.subjectId && studentIds.has(s.studentId)) {
      scores.splice(i, 1);
    }
  }

  const now = new Date().toISOString();
  for (const c of computed) {
    if (!hasAnyComponentScore(c)) continue;
    scores.push({
      id: `score-${input.examId}-${input.subjectId}-${c.studentId}`,
      examId: input.examId,
      studentId: c.studentId,
      subjectId: input.subjectId,
      cat1: c.cat1,
      cat2: c.cat2,
      projectWork: c.projectWork,
      groupWork: c.groupWork,
      examScore: c.examScore,
      totalScore: c.totalScore,
      grade: c.grade,
      interpretation: c.interpretation,
      subjectPosition: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Recompute subjectPosition across the whole class for this (exam, subject)
  const studentIdsInClass = new Set(
    mockStudents.filter((s) => s.classId === input.classId && s.isActive).map((s) => s.id)
  );
  const classScores = scores.filter(
    (s) =>
      s.examId === input.examId &&
      s.subjectId === input.subjectId &&
      studentIdsInClass.has(s.studentId)
  );
  const ranked = assignSubjectPositions(classScores);
  for (const r of ranked) {
    const target = scores.find(
      (s) => s.examId === r.examId && s.subjectId === r.subjectId && s.studentId === r.studentId
    );
    if (target) target.subjectPosition = r.subjectPosition;
  }

  return { success: true };
}

// Get all scores for a single student in a single exam (used by report card).
export async function getStudentExamScoresAction(
  studentId: string,
  examId: string
): Promise<Score[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return scores.filter((s) => s.studentId === studentId && s.examId === examId);
}

// ─── Workflow: class-report submissions + remarks ────────────────────────────

export async function getClassReportSubmissionAction(
  examId: string,
  classId: string
): Promise<ClassReportSubmission | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  return submissions.find((s) => s.examId === examId && s.classId === classId) ?? null;
}

export async function listSubmissionsForExamAction(
  examId: string
): Promise<ClassReportSubmission[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return submissions.filter((s) => s.examId === examId);
}

export async function getStudentRemarkAction(
  examId: string,
  studentId: string
): Promise<StudentRemark | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  return remarks.find((r) => r.examId === examId && r.studentId === studentId) ?? null;
}

export async function listRemarksForExamClassAction(
  examId: string,
  classId: string
): Promise<StudentRemark[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const studentIds = new Set(
    mockStudents.filter((s) => s.classId === classId && s.isActive).map((s) => s.id)
  );
  return remarks.filter((r) => r.examId === examId && studentIds.has(r.studentId));
}

function upsertRemark(
  examId: string,
  studentId: string,
  patch: Partial<Pick<StudentRemark, "classTeacherRemark" | "headOfSchoolComment">>
) {
  const existing = remarks.find((r) => r.examId === examId && r.studentId === studentId);
  if (existing) {
    if (patch.classTeacherRemark !== undefined) existing.classTeacherRemark = patch.classTeacherRemark;
    if (patch.headOfSchoolComment !== undefined) existing.headOfSchoolComment = patch.headOfSchoolComment;
    existing.updatedAt = new Date().toISOString();
    return;
  }
  remarks.push({
    examId,
    studentId,
    classTeacherRemark: patch.classTeacherRemark ?? null,
    headOfSchoolComment: patch.headOfSchoolComment ?? null,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveClassReportDraftAction(input: {
  examId: string;
  classId: string;
  remarks: { studentId: string; classTeacherRemark: string }[];
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }
  const exam = exams.find((e) => e.id === input.examId);
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Exam is published; remarks are locked." };

  for (const r of input.remarks) {
    upsertRemark(input.examId, r.studentId, {
      classTeacherRemark: r.classTeacherRemark.trim() || null,
    });
  }
  return { success: true };
}

export async function submitClassReportAction(
  input: SubmitClassReportInput & { submittedById: string }
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }

  const exam = exams.find((e) => e.id === input.examId);
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Exam is published; cannot resubmit." };

  const cls = mockClasses.find((c) => c.id === input.classId);
  if (!cls) return { success: false, error: "Class not found." };

  // Save remarks first
  for (const r of input.remarks) {
    upsertRemark(input.examId, r.studentId, {
      classTeacherRemark: r.classTeacherRemark.trim() || null,
    });
  }

  const now = new Date().toISOString();
  const existing = submissions.find(
    (s) => s.examId === input.examId && s.classId === input.classId
  );
  if (existing) {
    existing.status = "submitted";
    existing.submittedById = input.submittedById;
    existing.submittedAt = now;
  } else {
    submissions.push({
      id: `submission-${input.examId}-${input.classId}`,
      examId: input.examId,
      classId: input.classId,
      status: "submitted",
      submittedById: input.submittedById,
      submittedAt: now,
    });
  }

  return { success: true };
}

export async function updateHeadOfSchoolCommentAction(input: {
  examId: string;
  studentId: string;
  comment: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }
  const exam = exams.find((e) => e.id === input.examId);
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Exam is published; comments are locked." };

  upsertRemark(input.examId, input.studentId, {
    headOfSchoolComment: input.comment.trim() || null,
  });
  return { success: true };
}

// For the teacher's exam landing page: which (class, subject) cells the teacher
// is responsible for entering, grouped by class.
// Lists classes where the given staff is one of the class teachers.
export async function listClassTeacherClassesAction(teacherId: string): Promise<
  { classId: string; className: string }[]
> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return mockClasses
    .filter((c) => c.classTeachers.some((t) => t.staffId === teacherId))
    .map((c) => ({ classId: c.id, className: c.name }));
}

export async function listTeacherAssignmentsAction(teacherId: string): Promise<
  {
    classId: string;
    className: string;
    subjects: { subjectId: string; subjectName: string }[];
  }[]
> {
  if (process.env.USE_MOCK_DATA !== "true") return [];

  // Subject-level assignments
  const subjectAssignments = mockClassSubjects.filter((cs) => cs.teacherId === teacherId);

  // Class-teacher assignments — they're responsible for the whole class report,
  // but for score entry we'll only show subjects they actually teach.
  const byClass: Record<string, { classId: string; className: string; subjects: { subjectId: string; subjectName: string }[] }> = {};
  for (const cs of subjectAssignments) {
    const cls = mockClasses.find((c) => c.id === cs.classId);
    if (!cls) continue;
    const entry = (byClass[cs.classId] ??= {
      classId: cs.classId,
      className: cls.name,
      subjects: [],
    });
    if (!entry.subjects.some((s) => s.subjectId === cs.subjectId)) {
      entry.subjects.push({ subjectId: cs.subjectId, subjectName: cs.subjectName });
    }
  }

  return Object.values(byClass).sort((a, b) => a.className.localeCompare(b.className));
}
