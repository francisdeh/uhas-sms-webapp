import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  classTeachers,
  promotionDecisions,
  promotionSubmissions,
  staff,
  students,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { nextAcademicYear } from "@/features/promotions/lib/academic-year";
import type {
  DecisionRowView,
  PromotionDecision,
  PromotionDecisionKind,
  PromotionSubmission,
  PromotionSubmissionDetail,
} from "@/features/promotions/types";

export async function getSubmissionByClassId(
  classId: string
): Promise<PromotionSubmissionDetail | null> {
  const schoolId = await getCurrentSchoolId();
  const sub = await db.query.promotionSubmissions.findFirst({
    where: and(
      eq(promotionSubmissions.schoolId, schoolId),
      eq(promotionSubmissions.classId, classId)
    ),
  });
  if (!sub) return null;
  return buildDetail(sub.id);
}

export async function getSubmissionById(
  submissionId: string
): Promise<PromotionSubmissionDetail | null> {
  return buildDetail(submissionId);
}

async function buildDetail(submissionId: string): Promise<PromotionSubmissionDetail | null> {
  const sub = await db.query.promotionSubmissions.findFirst({
    where: eq(promotionSubmissions.id, submissionId),
  });
  if (!sub) return null;

  const cls = await db.query.classes.findFirst({ where: eq(classes.id, sub.classId) });
  if (!cls) return null;

  const nextYear = nextAcademicYear(cls.academicYear);
  const nextYearClassRows = await db.query.classes.findMany({
    where: and(eq(classes.academicYear, nextYear), eq(classes.division, cls.division)),
    orderBy: [asc(classes.name)],
  });
  const nextYearClasses = nextYearClassRows.map((c) => ({ id: c.id, name: c.name }));

  const decisionRows = await db.query.promotionDecisions.findMany({
    where: eq(promotionDecisions.submissionId, submissionId),
  });

  const studentIds = decisionRows.map((d) => d.studentId);
  const studentRows = studentIds.length === 0
    ? []
    : await db.query.students.findMany({ where: inArray(students.id, studentIds) });
  const studentById = new Map(studentRows.map((s) => [s.id, s]));

  const decisions: DecisionRowView[] = decisionRows
    .map((d) => {
      const s = studentById.get(d.studentId);
      const decision: PromotionDecision = {
        id: d.id,
        submissionId: d.submissionId,
        studentId: d.studentId,
        decision: d.decision as PromotionDecisionKind,
        targetClassId: d.targetClassId,
        reason: d.reason,
        suggestedDecision: (d.suggestedDecision as PromotionDecisionKind | null) ?? null,
        suggestedReason: d.suggestedReason,
        failedCoreSubjects: d.failedCoreSubjects,
      };
      return {
        decision,
        studentName: s
          ? `${s.firstName} ${s.middleName ? s.middleName + " " : ""}${s.lastName}`
          : d.studentId,
        studentPhotoUrl: s?.photoUrl ?? null,
      };
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  const classTeacherRows = await db
    .select({
      staffId: classTeachers.staffId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      isPrimary: classTeachers.isPrimary,
    })
    .from(classTeachers)
    .innerJoin(staff, eq(staff.id, classTeachers.staffId))
    .where(eq(classTeachers.classId, cls.id));

  const submission: PromotionSubmission = {
    id: sub.id,
    schoolId: sub.schoolId,
    classId: sub.classId,
    academicYear: sub.academicYear,
    status: sub.status as PromotionSubmission["status"],
    submittedById: sub.submittedById,
    submittedByName: null,
    submittedAt: sub.submittedAt?.toISOString() ?? null,
    reviewerComment: sub.reviewerComment,
    reviewedById: sub.reviewedById,
    reviewedByName: null,
    reviewedAt: sub.reviewedAt?.toISOString() ?? null,
  };

  return {
    submission,
    className: cls.name,
    division: cls.division,
    nextAcademicYear: nextYear,
    nextYearClasses,
    decisions,
    classTeachers: classTeacherRows.map((t) => ({
      staffId: t.staffId,
      staffName: `${t.firstName} ${t.lastName}`,
      isPrimary: t.isPrimary ?? false,
    })),
  };
}
