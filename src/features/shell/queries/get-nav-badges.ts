import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { classes, lessonPlans } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import type { SessionUser } from "@/features/auth/types";

// Returns a map of nav href → pending count, computed per user.
export async function getNavBadges(user: SessionUser): Promise<Record<string, number>> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();
  const badges: Record<string, number> = {};

  if (user.role === "DeputyHead" && user.linkedId) {
    const division = await getDeputyHeadDivision(user.linkedId);
    if (division) {
      // Class IDs in this division for this year
      const divisionClasses = await db.query.classes.findMany({
        where: and(
          eq(classes.schoolId, schoolId),
          eq(classes.academicYear, year),
          eq(classes.division, division)
        ),
      });
      const classIds = divisionClasses.map((c) => c.id);
      if (classIds.length > 0) {
        const pending = await db.query.lessonPlans.findMany({
          where: and(
            eq(lessonPlans.schoolId, schoolId),
            inArray(lessonPlans.classId, classIds),
            eq(lessonPlans.status, "unit_head_approved")
          ),
        });
        if (pending.length > 0) badges["/deputy-head/lesson-plans"] = pending.length;
      }
    }
  }

  if (user.role === "Teacher" && user.isUnitHead && user.unitHeadOf) {
    const divisionClasses = await db.query.classes.findMany({
      where: and(
        eq(classes.schoolId, schoolId),
        eq(classes.academicYear, year),
        eq(classes.division, user.unitHeadOf)
      ),
    });
    const classIds = divisionClasses.map((c) => c.id);
    if (classIds.length > 0) {
      const pending = await db.query.lessonPlans.findMany({
        where: and(
          eq(lessonPlans.schoolId, schoolId),
          inArray(lessonPlans.classId, classIds),
          eq(lessonPlans.status, "submitted")
        ),
      });
      if (pending.length > 0) badges["/teacher/reviews"] = pending.length;
    }
  }

  return badges;
}
