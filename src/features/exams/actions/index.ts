"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { asDbClient } from "@/db/with-tx";
import {
  exams,
  scores,
  classes,
  classTeachers,
  classSubjects,
  subjects,
  students,
  enrollments,
  staff,
  classReportSubmissions,
  studentReportRemarks,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { writeAuditLog } from "@/lib/audit-log";
import { notifyAudience } from "@/features/notifications/lib/create-notification";
import { getSchoolSettings } from "@/features/settings/queries/get-school-settings";
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

function toExam(row: typeof exams.$inferSelect): Exam {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    type: row.type as ExamType,
    term: row.term,
    academicYear: row.academicYear,
    isPublished: row.isPublished ?? false,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toScore(row: typeof scores.$inferSelect): Score {
  return {
    id: row.id,
    examId: row.examId,
    studentId: row.studentId,
    subjectId: row.subjectId,
    cat1: row.cat1,
    cat2: row.cat2,
    projectWork: row.projectWork,
    groupWork: row.groupWork,
    examScore: row.examScore,
    totalScore: row.totalScore,
    grade: row.grade,
    interpretation: row.interpretation,
    subjectPosition: row.subjectPosition,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listExamsAction(filter?: {
  type?: ExamType;
  term?: number;
  academicYear?: string;
  isPublished?: boolean;
}): Promise<Exam[]> {
  const schoolId = await getCurrentSchoolId();
  const year = filter?.academicYear ?? (await getCurrentAcademicYear());

  const rows = await db.query.exams.findMany({
    where: and(
      eq(exams.schoolId, schoolId),
      eq(exams.academicYear, year),
      filter?.type ? eq(exams.type, filter.type) : undefined,
      filter?.term ? eq(exams.term, filter.term) : undefined,
      filter?.isPublished !== undefined ? eq(exams.isPublished, filter.isPublished) : undefined
    ),
    orderBy: [desc(exams.academicYear), desc(exams.term)],
  });

  return rows
    .map(toExam)
    .sort((a, b) => {
      if (a.academicYear !== b.academicYear) return b.academicYear.localeCompare(a.academicYear);
      if (a.term !== b.term) return b.term - a.term;
      if (a.type !== b.type) return a.type === "MidTerm" ? -1 : 1;
      return 0;
    });
}

export async function getExamAction(id: string): Promise<Exam | null> {
  const row = await db.query.exams.findFirst({ where: eq(exams.id, id) });
  return row ? toExam(row) : null;
}

export async function createExamAction(
  input: CreateExamInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const schoolId = await getCurrentSchoolId();

  const duplicate = await db.query.exams.findFirst({
    where: and(
      eq(exams.schoolId, schoolId),
      eq(exams.type, input.type),
      eq(exams.term, input.term),
      eq(exams.academicYear, input.academicYear)
    ),
  });
  if (duplicate) {
    return { success: false, error: "An exam of this type already exists for this term." };
  }

  const id = `exam-${input.type.toLowerCase()}-t${input.term}-${input.academicYear.replace("/", "-")}-${Date.now()}`;
  await db.insert(exams).values({
    id,
    schoolId,
    name: input.name,
    type: input.type,
    term: input.term,
    academicYear: input.academicYear,
    isPublished: false,
    publishedAt: null,
  });

  revalidatePath("/admin/examinations");
  return { success: true, id };
}

export async function publishExamAction(id: string): Promise<ActionResult> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, id) });
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Already published." };
  await db
    .update(exams)
    .set({ isPublished: true, publishedAt: new Date() })
    .where(eq(exams.id, id));

  // Notify all parents — gated by the school-wide notification toggle.
  const settings = await getSchoolSettings();
  if (settings.notificationDefaults.onResultsPublished) {
    await notifyAudience(
      { type: "allParents" },
      {
        kind: "results_published",
        title: `${exam.name} results published`,
        body: `Term ${exam.term} ${exam.type === "MidTerm" ? "mid-term" : "end-of-term"} results are now available.`,
        link: `/parent/results`,
      }
    );
  }

  revalidatePath("/admin/examinations");
  return { success: true };
}

export async function unpublishExamAction(id: string): Promise<ActionResult> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, id) });
  if (!exam) return { success: false, error: "Exam not found." };
  await db
    .update(exams)
    .set({ isPublished: false, publishedAt: null })
    .where(eq(exams.id, id));
  revalidatePath("/admin/examinations");
  return { success: true };
}

export async function getScoresForGridAction(input: {
  examId: string;
  subjectId: string;
  classId: string;
}): Promise<{
  exam: Exam | null;
  rows: { studentId: string; studentName: string; score: Score | null }[];
}> {
  const examRow = await db.query.exams.findFirst({ where: eq(exams.id, input.examId) });
  if (!examRow) return { exam: null, rows: [] };

  // Roster: students with an active enrollment in this class for the exam's year
  const rosterRows = await db
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.classId, input.classId),
        eq(enrollments.academicYear, examRow.academicYear),
        eq(enrollments.status, "Active"),
        eq(students.isActive, true)
      )
    )
    .orderBy(asc(students.lastName));

  const studentIds = rosterRows.map((s) => s.id);
  const scoreRows = studentIds.length === 0
    ? []
    : await db.query.scores.findMany({
        where: and(
          eq(scores.examId, input.examId),
          eq(scores.subjectId, input.subjectId),
          inArray(scores.studentId, studentIds)
        ),
      });
  const scoreByStudent = new Map(scoreRows.map((s) => [s.studentId, s]));

  return {
    exam: toExam(examRow),
    rows: rosterRows.map((s) => {
      const sc = scoreByStudent.get(s.id);
      return {
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        score: sc ? toScore(sc) : null,
      };
    }),
  };
}

export async function saveScoresAction(input: {
  examId: string;
  subjectId: string;
  classId: string;
  rows: ScoreInput[];
}): Promise<ActionResult> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, input.examId) });
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) {
    return { success: false, error: "Exam is published. Unpublish first to edit scores." };
  }

  // Validate ranges
  for (const row of input.rows) {
    const fields = ["cat1", "cat2", "projectWork", "groupWork", "examScore"] as const;
    for (const f of fields) {
      const v = row[f];
      if (v != null && (v < 0 || v > 100)) {
        return { success: false, error: `${f} must be between 0 and 100.` };
      }
    }
  }

  const cookieStore = await cookies();
  const actor = cookieStore.get("session_uid")?.value ?? "system";

  const now = new Date();

  await db.transaction(async (tx) => {
    for (const row of input.rows) {
      const components = {
        cat1: row.cat1 ?? null,
        cat2: row.cat2 ?? null,
        projectWork: row.projectWork ?? null,
        groupWork: row.groupWork ?? null,
        examScore: row.examScore ?? null,
      };
      const totalScore = hasAnyComponentScore(components)
        ? computeTotalScore(exam.type as ExamType, components)
        : null;
      const graded = totalScore != null ? computeGrade(totalScore) : null;

      // Find existing by (exam, subject, student) — the natural key.
      // Constructed id is only used for NEW inserts.
      const existing = await tx.query.scores.findFirst({
        where: and(
          eq(scores.examId, input.examId),
          eq(scores.subjectId, input.subjectId),
          eq(scores.studentId, row.studentId)
        ),
      });

      if (!hasAnyComponentScore(components)) {
        if (existing) await tx.delete(scores).where(eq(scores.id, existing.id));
        continue;
      }

      if (existing) {
        if (existing.totalScore != null) {
          await writeAuditLog(tx, {
            userId: actor,
            action: "SCORE_OVERRIDE",
            targetTable: "scores",
            targetId: existing.id,
            before: existing,
            after: { ...components, totalScore, grade: graded?.grade, interpretation: graded?.interpretation },
          });
        }
        await tx
          .update(scores)
          .set({
            ...components,
            totalScore,
            grade: graded?.grade ?? null,
            interpretation: graded?.interpretation ?? null,
            updatedAt: now,
          })
          .where(eq(scores.id, existing.id));
      } else {
        const id = `score-${input.examId}-${input.subjectId}-${row.studentId}`;
        await tx.insert(scores).values({
          id,
          examId: input.examId,
          studentId: row.studentId,
          subjectId: input.subjectId,
          ...components,
          totalScore,
          grade: graded?.grade ?? null,
          interpretation: graded?.interpretation ?? null,
          subjectPosition: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Recompute subjectPosition across the class for (exam, subject).
    const rosterStudentIds = (
      await tx
        .select({ id: students.id })
        .from(enrollments)
        .innerJoin(students, eq(students.id, enrollments.studentId))
        .where(
          and(
            eq(enrollments.classId, input.classId),
            eq(enrollments.academicYear, exam.academicYear),
            eq(enrollments.status, "Active"),
            eq(students.isActive, true)
          )
        )
    ).map((r) => r.id);

    if (rosterStudentIds.length > 0) {
      const classScores = await tx.query.scores.findMany({
        where: and(
          eq(scores.examId, input.examId),
          eq(scores.subjectId, input.subjectId),
          inArray(scores.studentId, rosterStudentIds)
        ),
      });
      const ranked = assignSubjectPositions(classScores.map(toScore));
      for (const r of ranked) {
        await tx
          .update(scores)
          .set({ subjectPosition: r.subjectPosition })
          .where(eq(scores.id, r.id));
      }
    }
  });

  revalidatePath("/teacher/examinations");
  return { success: true };
}

export async function getStudentExamScoresAction(
  studentId: string,
  examId: string
): Promise<Score[]> {
  const rows = await db.query.scores.findMany({
    where: and(eq(scores.studentId, studentId), eq(scores.examId, examId)),
  });
  return rows.map(toScore);
}

// ─── Workflow: class-report submissions + remarks ────────────────────────────

export async function getClassReportSubmissionAction(
  examId: string,
  classId: string
): Promise<ClassReportSubmission | null> {
  const row = await db.query.classReportSubmissions.findFirst({
    where: and(
      eq(classReportSubmissions.examId, examId),
      eq(classReportSubmissions.classId, classId)
    ),
  });
  if (!row) return null;
  return {
    id: row.id,
    examId: row.examId,
    classId: row.classId,
    status: (row.status as "draft" | "submitted") ?? "draft",
    submittedById: row.submittedById,
    submittedAt: row.submittedAt?.toISOString() ?? null,
  };
}

export async function listSubmissionsForExamAction(
  examId: string
): Promise<ClassReportSubmission[]> {
  const rows = await db.query.classReportSubmissions.findMany({
    where: eq(classReportSubmissions.examId, examId),
  });
  return rows.map((r) => ({
    id: r.id,
    examId: r.examId,
    classId: r.classId,
    status: (r.status as "draft" | "submitted") ?? "draft",
    submittedById: r.submittedById,
    submittedAt: r.submittedAt?.toISOString() ?? null,
  }));
}

export async function getStudentRemarkAction(
  examId: string,
  studentId: string
): Promise<StudentRemark | null> {
  const row = await db.query.studentReportRemarks.findFirst({
    where: and(
      eq(studentReportRemarks.examId, examId),
      eq(studentReportRemarks.studentId, studentId)
    ),
  });
  if (!row) return null;
  return {
    examId: row.examId,
    studentId: row.studentId,
    classTeacherRemark: row.classTeacherRemark,
    headOfSchoolComment: row.headOfSchoolComment,
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listRemarksForExamClassAction(
  examId: string,
  classId: string
): Promise<StudentRemark[]> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return [];

  const studentIds = (
    await db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(
        and(
          eq(enrollments.classId, classId),
          eq(enrollments.academicYear, exam.academicYear),
          eq(enrollments.status, "Active"),
          eq(students.isActive, true)
        )
      )
  ).map((r) => r.id);
  if (studentIds.length === 0) return [];

  const rows = await db.query.studentReportRemarks.findMany({
    where: and(
      eq(studentReportRemarks.examId, examId),
      inArray(studentReportRemarks.studentId, studentIds)
    ),
  });
  return rows.map((r) => ({
    examId: r.examId,
    studentId: r.studentId,
    classTeacherRemark: r.classTeacherRemark,
    headOfSchoolComment: r.headOfSchoolComment,
    updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
  }));
}

async function upsertRemark(
  tx: typeof db,
  examId: string,
  studentId: string,
  patch: { classTeacherRemark?: string | null; headOfSchoolComment?: string | null }
) {
  const id = `remark-${examId}-${studentId}`;
  const existing = await tx.query.studentReportRemarks.findFirst({
    where: eq(studentReportRemarks.id, id),
  });
  if (existing) {
    const update: Partial<typeof studentReportRemarks.$inferInsert> = { updatedAt: new Date() };
    if (patch.classTeacherRemark !== undefined) update.classTeacherRemark = patch.classTeacherRemark;
    if (patch.headOfSchoolComment !== undefined) update.headOfSchoolComment = patch.headOfSchoolComment;
    await tx.update(studentReportRemarks).set(update).where(eq(studentReportRemarks.id, id));
  } else {
    await tx.insert(studentReportRemarks).values({
      id,
      examId,
      studentId,
      classTeacherRemark: patch.classTeacherRemark ?? null,
      headOfSchoolComment: patch.headOfSchoolComment ?? null,
    });
  }
}

export async function saveClassReportDraftAction(input: {
  examId: string;
  classId: string;
  remarks: { studentId: string; classTeacherRemark: string }[];
}): Promise<ActionResult> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, input.examId) });
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Exam is published; remarks are locked." };

  await db.transaction(async (tx) => {
    for (const r of input.remarks) {
      await upsertRemark(asDbClient(tx), input.examId, r.studentId, {
        classTeacherRemark: r.classTeacherRemark.trim() || null,
      });
    }
  });
  revalidatePath(`/teacher/class-reports/${input.examId}/${input.classId}`);
  return { success: true };
}

export async function submitClassReportAction(
  input: SubmitClassReportInput & { submittedById: string }
): Promise<ActionResult> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, input.examId) });
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Exam is published; cannot resubmit." };

  const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
  if (!cls) return { success: false, error: "Class not found." };

  await db.transaction(async (tx) => {
    for (const r of input.remarks) {
      await upsertRemark(asDbClient(tx), input.examId, r.studentId, {
        classTeacherRemark: r.classTeacherRemark.trim() || null,
      });
    }

    const id = `crs-${input.examId}-${input.classId}`;
    const existing = await tx.query.classReportSubmissions.findFirst({
      where: eq(classReportSubmissions.id, id),
    });
    if (existing) {
      await tx
        .update(classReportSubmissions)
        .set({
          status: "submitted",
          submittedById: input.submittedById,
          submittedAt: new Date(),
        })
        .where(eq(classReportSubmissions.id, id));
    } else {
      await tx.insert(classReportSubmissions).values({
        id,
        examId: input.examId,
        classId: input.classId,
        status: "submitted",
        submittedById: input.submittedById,
        submittedAt: new Date(),
      });
    }
  });

  revalidatePath(`/teacher/class-reports/${input.examId}/${input.classId}`);
  revalidatePath(`/admin/examinations/${input.examId}/review`);
  return { success: true };
}

export async function updateHeadOfSchoolCommentAction(input: {
  examId: string;
  studentId: string;
  comment: string;
}): Promise<ActionResult> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, input.examId) });
  if (!exam) return { success: false, error: "Exam not found." };
  if (exam.isPublished) return { success: false, error: "Exam is published; comments are locked." };

  await db.transaction(async (tx) => {
    await upsertRemark(asDbClient(tx), input.examId, input.studentId, {
      headOfSchoolComment: input.comment.trim() || null,
    });
  });
  revalidatePath(`/admin/examinations/${input.examId}/review`);
  return { success: true };
}

export async function listClassTeacherClassesAction(teacherId: string): Promise<
  { classId: string; className: string }[]
> {
  const year = await getCurrentAcademicYear();
  const rows = await db
    .select({ classId: classes.id, className: classes.name })
    .from(classTeachers)
    .innerJoin(classes, eq(classes.id, classTeachers.classId))
    .where(and(eq(classTeachers.staffId, teacherId), eq(classes.academicYear, year)));
  return rows;
}

export async function listTeacherAssignmentsAction(teacherId: string): Promise<
  {
    classId: string;
    className: string;
    subjects: { subjectId: string; subjectName: string }[];
  }[]
> {
  const year = await getCurrentAcademicYear();
  const rows = await db
    .select({
      classId: classSubjects.classId,
      className: classes.name,
      academicYear: classes.academicYear,
      subjectId: classSubjects.subjectId,
      subjectName: subjects.name,
    })
    .from(classSubjects)
    .innerJoin(classes, eq(classes.id, classSubjects.classId))
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .where(and(eq(classSubjects.teacherId, teacherId), eq(classes.academicYear, year)));

  const byClass = new Map<
    string,
    { classId: string; className: string; subjects: { subjectId: string; subjectName: string }[] }
  >();
  for (const r of rows) {
    const entry = byClass.get(r.classId) ?? {
      classId: r.classId,
      className: r.className,
      subjects: [],
    };
    if (!entry.subjects.some((s) => s.subjectId === r.subjectId)) {
      entry.subjects.push({ subjectId: r.subjectId, subjectName: r.subjectName });
    }
    byClass.set(r.classId, entry);
  }
  return Array.from(byClass.values()).sort((a, b) => a.className.localeCompare(b.className));
}

