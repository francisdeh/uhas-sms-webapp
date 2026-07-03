import { getApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import type { SchoolClass, ClassTeacher } from "@/features/classes/types";
import type { Division } from "@/features/auth/types";
import type { components } from "@/types/api";

export async function getClassById(id: string): Promise<SchoolClass | undefined> {
  const api = await getApi();
  try {
    const [row, teachers] = await Promise.all([
      api.classes.get(id),
      api.classes.teachers.list(id).then((r) => r.items),
    ]);
    const classTeachers: ClassTeacher[] = teachers.map((t) => ({
      staffId: t.staffId,
      staffName: `${t.staffFirstName} ${t.staffLastName}`.trim(),
      isPrimary: t.isPrimary,
    }));
    return toSchoolClass(row, classTeachers);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

// Bulk fetch class_teachers + staff names for a set of class IDs. Fan-out
// pattern — the API exposes per-class endpoints only.
export async function getClassTeachersFor(
  classIds: string[],
): Promise<Map<string, ClassTeacher[]>> {
  if (classIds.length === 0) return new Map();
  const api = await getApi();
  const entries = await Promise.all(
    classIds.map(async (classId) => {
      const res = await api.classes.teachers.list(classId);
      const teachers: ClassTeacher[] = res.items.map((t) => ({
        staffId: t.staffId,
        staffName: `${t.staffFirstName} ${t.staffLastName}`.trim(),
        isPrimary: t.isPrimary,
      }));
      return [classId, teachers] as const;
    }),
  );
  return new Map(entries);
}

export function toSchoolClass(
  row: components["schemas"]["ClassRead"],
  teachers: ClassTeacher[],
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
