import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  classTeachers,
  enrollments,
  promotionSubmissions,
  schools,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import type { PromotionSubmission } from "@/features/promotions/types";

export type TeacherClassRow = {
  classId: string;
  className: string;
  division: string;
  isPrimary: boolean;
  totalStudents: number;
  submission: PromotionSubmission | null;
};

export async function getTeacherPromotionClasses(
  teacherId: string
): Promise<TeacherClassRow[]> {
  const schoolId = await getCurrentSchoolId();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const year = school?.academicYear ?? "2025/2026";

  const myAssignments = await db
    .select({
      classId: classes.id,
      className: classes.name,
      division: classes.division,
      isPrimary: classTeachers.isPrimary,
    })
    .from(classTeachers)
    .innerJoin(classes, eq(classes.id, classTeachers.classId))
    .where(and(eq(classTeachers.staffId, teacherId), eq(classes.academicYear, year)));

  const classIds = myAssignments.map((c) => c.classId);
  if (classIds.length === 0) return [];

  const [subs, enrolled] = await Promise.all([
    db.query.promotionSubmissions.findMany({
      where: and(
        inArray(promotionSubmissions.classId, classIds),
        eq(promotionSubmissions.academicYear, year)
      ),
    }),
    db
      .select({ classId: enrollments.classId })
      .from(enrollments)
      .where(
        and(
          inArray(enrollments.classId, classIds),
          eq(enrollments.academicYear, year),
          eq(enrollments.status, "Active")
        )
      ),
  ]);

  const subByClass = new Map(subs.map((s) => [s.classId, s]));
  const countByClass = new Map<string, number>();
  for (const r of enrolled) {
    countByClass.set(r.classId, (countByClass.get(r.classId) ?? 0) + 1);
  }

  return myAssignments.map((a) => {
    const s = subByClass.get(a.classId);
    return {
      classId: a.classId,
      className: a.className,
      division: a.division,
      isPrimary: a.isPrimary ?? false,
      totalStudents: countByClass.get(a.classId) ?? 0,
      submission: s
        ? {
            id: s.id,
            schoolId: s.schoolId,
            classId: s.classId,
            academicYear: s.academicYear,
            status: s.status as PromotionSubmission["status"],
            submittedById: s.submittedById,
            submittedByName: null,
            submittedAt: s.submittedAt?.toISOString() ?? null,
            reviewerComment: s.reviewerComment,
            reviewedById: s.reviewedById,
            reviewedByName: null,
            reviewedAt: s.reviewedAt?.toISOString() ?? null,
          }
        : null,
    };
  });
}
