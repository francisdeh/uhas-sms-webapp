import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  enrollments,
  promotionSubmissions,
  promotionDecisions,
  schools,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getClassTeachersFor } from "@/features/classes/queries/get-class-by-id";
import type { ClassOverviewRow, PromotionSubmission } from "@/features/promotions/types";

export async function getPromotionOverview(): Promise<ClassOverviewRow[]> {
  const schoolId = await getCurrentSchoolId();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const year = school?.academicYear ?? "2025/2026";

  const classesThisYear = await db.query.classes.findMany({
    where: and(eq(classes.schoolId, schoolId), eq(classes.academicYear, year)),
  });
  const classIds = classesThisYear.map((c) => c.id);

  const teachersMap = await getClassTeachersFor(classIds);

  const submissionRows = await db.query.promotionSubmissions.findMany({
    where: and(
      eq(promotionSubmissions.schoolId, schoolId),
      eq(promotionSubmissions.academicYear, year)
    ),
  });
  const submissionByClass = new Map(submissionRows.map((s) => [s.classId, s]));

  // Per-class active enrollment count
  const enrolledRows = await db
    .select({ classId: enrollments.classId, studentId: enrollments.studentId })
    .from(enrollments)
    .where(
      and(eq(enrollments.academicYear, year), eq(enrollments.status, "Active"))
    );
  const countByClass = new Map<string, number>();
  for (const r of enrolledRows) {
    countByClass.set(r.classId, (countByClass.get(r.classId) ?? 0) + 1);
  }

  // Decision counts per submission
  const submissionIds = submissionRows.map((s) => s.id);
  const decisionCountBySubmission = new Map<string, number>();
  if (submissionIds.length > 0) {
    const decisions = await db.query.promotionDecisions.findMany({
      where: inArray(promotionDecisions.submissionId, submissionIds),
    });
    for (const d of decisions) {
      decisionCountBySubmission.set(
        d.submissionId,
        (decisionCountBySubmission.get(d.submissionId) ?? 0) + 1
      );
    }
  }

  return classesThisYear.map((c) => {
    const submission = submissionByClass.get(c.id);
    return {
      classId: c.id,
      className: c.name,
      division: c.division,
      classTeachers: teachersMap.get(c.id) ?? [],
      totalStudents: countByClass.get(c.id) ?? 0,
      decidedCount: submission ? decisionCountBySubmission.get(submission.id) ?? 0 : 0,
      submission: submission ? toSubmission(submission) : null,
    };
  });
}

function toSubmission(row: typeof promotionSubmissions.$inferSelect): PromotionSubmission {
  return {
    id: row.id,
    schoolId: row.schoolId,
    classId: row.classId,
    academicYear: row.academicYear,
    status: row.status as PromotionSubmission["status"],
    submittedById: row.submittedById,
    submittedByName: null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewerComment: row.reviewerComment,
    reviewedById: row.reviewedById,
    reviewedByName: null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}
