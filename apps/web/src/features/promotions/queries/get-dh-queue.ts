import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { classes, classTeachers, promotionSubmissions, schools, staff } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import type { Division } from "@/features/auth/types";
import type { PromotionSubmission } from "@/features/promotions/types";

export type DeputyHeadQueueRow = {
  submission: PromotionSubmission;
  classId: string;
  className: string;
  division: Division;
  classTeacherNames: string[];
};

export async function getDeputyHeadPromotionQueue(
  division: Division
): Promise<DeputyHeadQueueRow[]> {
  const schoolId = await getCurrentSchoolId();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const year = school?.academicYear ?? "2025/2026";

  const divisionClasses = await db.query.classes.findMany({
    where: and(
      eq(classes.schoolId, schoolId),
      eq(classes.division, division),
      eq(classes.academicYear, year)
    ),
  });
  const classIds = divisionClasses.map((c) => c.id);
  if (classIds.length === 0) return [];

  const subs = await db.query.promotionSubmissions.findMany({
    where: and(
      eq(promotionSubmissions.academicYear, year),
      inArray(promotionSubmissions.classId, classIds)
    ),
  });

  const ctRows = await db
    .select({
      classId: classTeachers.classId,
      firstName: staff.firstName,
      lastName: staff.lastName,
    })
    .from(classTeachers)
    .innerJoin(staff, eq(staff.id, classTeachers.staffId))
    .where(inArray(classTeachers.classId, classIds));
  const teachersByClass = new Map<string, string[]>();
  for (const r of ctRows) {
    const list = teachersByClass.get(r.classId) ?? [];
    list.push(`${r.firstName} ${r.lastName}`);
    teachersByClass.set(r.classId, list);
  }
  const classById = new Map(divisionClasses.map((c) => [c.id, c]));

  return subs
    .map((s) => {
      const cls = classById.get(s.classId)!;
      return {
        submission: {
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
        } satisfies PromotionSubmission,
        classId: cls.id,
        className: cls.name,
        division: cls.division as Division,
        classTeacherNames: teachersByClass.get(cls.id) ?? [],
      };
    })
    .sort((a, b) => {
      const order: Record<string, number> = {
        submitted: 0,
        sent_back: 1,
        approved: 2,
        draft: 3,
      };
      const delta = (order[a.submission.status] ?? 99) - (order[b.submission.status] ?? 99);
      if (delta !== 0) return delta;
      return a.className.localeCompare(b.className);
    });
}
