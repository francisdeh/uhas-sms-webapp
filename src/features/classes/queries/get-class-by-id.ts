import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { classes, classTeachers, staff } from "@/db/schema";
import type { SchoolClass, ClassTeacher } from "@/features/classes/types";
import type { Division } from "@/features/auth/types";

export async function getClassById(id: string): Promise<SchoolClass | undefined> {
  const row = await db.query.classes.findFirst({ where: eq(classes.id, id) });
  if (!row) return undefined;
  const teachers = await getClassTeachersFor([id]);
  return toSchoolClass(row, teachers.get(id) ?? []);
}

// Bulk fetch class_teachers + staff names for a set of class IDs.
export async function getClassTeachersFor(
  classIds: string[]
): Promise<Map<string, ClassTeacher[]>> {
  if (classIds.length === 0) return new Map();
  const rows = await db
    .select({
      classId: classTeachers.classId,
      staffId: classTeachers.staffId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      isPrimary: classTeachers.isPrimary,
    })
    .from(classTeachers)
    .innerJoin(staff, eq(staff.id, classTeachers.staffId))
    .where(inArray(classTeachers.classId, classIds));

  const map = new Map<string, ClassTeacher[]>();
  for (const r of rows) {
    const list = map.get(r.classId) ?? [];
    list.push({
      staffId: r.staffId,
      staffName: `${r.firstName} ${r.lastName}`,
      isPrimary: r.isPrimary ?? false,
    });
    map.set(r.classId, list);
  }
  return map;
}

export function toSchoolClass(
  row: typeof classes.$inferSelect,
  teachers: ClassTeacher[]
): SchoolClass {
  return {
    id: row.id,
    schoolId: row.schoolId,
    name: row.name,
    division: row.division as Division,
    academicYear: row.academicYear,
    classTeachers: teachers,
  };
}
