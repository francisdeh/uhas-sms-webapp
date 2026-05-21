import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, classes } from "@/db/schema";
import type { Division } from "@/features/auth/types";

export type EnrollmentView = {
  classId: string;
  className: string;
  division: Division;
};

// Fetch the active enrollment + class for one student in a given year.
export async function getActiveEnrollment(
  studentId: string,
  academicYear: string
): Promise<EnrollmentView | null> {
  const row = await db
    .select({
      classId: classes.id,
      className: classes.name,
      division: classes.division,
    })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(
      and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.academicYear, academicYear),
        eq(enrollments.status, "Active")
      )
    )
    .limit(1);
  if (row.length === 0) return null;
  return {
    classId: row[0].classId,
    className: row[0].className,
    division: row[0].division as Division,
  };
}

// Bulk-fetch active enrollments for many students at once. Used by list pages
// to avoid N+1.
export async function getActiveEnrollmentMap(
  studentIds: string[],
  academicYear: string
): Promise<Map<string, EnrollmentView>> {
  if (studentIds.length === 0) return new Map();
  const rows = await db
    .select({
      studentId: enrollments.studentId,
      classId: classes.id,
      className: classes.name,
      division: classes.division,
    })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(
      and(
        inArray(enrollments.studentId, studentIds),
        eq(enrollments.academicYear, academicYear),
        eq(enrollments.status, "Active")
      )
    );

  const map = new Map<string, EnrollmentView>();
  for (const r of rows) {
    map.set(r.studentId, {
      classId: r.classId,
      className: r.className,
      division: r.division as Division,
    });
  }
  return map;
}
