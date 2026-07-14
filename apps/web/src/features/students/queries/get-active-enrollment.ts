import { getApi } from "@/lib/api/server";
import { KG, type Division } from "@/features/auth/types";

export type EnrollmentView = {
  classId: string;
  className: string;
  division: Division;
};

// Fetch the active enrollment + class for one student in a given year.
export async function getActiveEnrollment(
  studentId: string,
  academicYear: string,
): Promise<EnrollmentView | null> {
  const api = await getApi();
  const list = await api.students.enrollments(studentId);
  const active = list.items.find(
    (e) => e.status === "Active" && e.academicYear === academicYear,
  );
  if (!active) return null;
  return {
    classId: active.classId,
    className: active.className ?? "",
    division: (active.division as Division) ?? KG,
  };
}

// Bulk-fetch active enrollments for many students at once. Used by list pages
// to avoid N+1.
export async function getActiveEnrollmentMap(
  studentIds: string[],
  academicYear: string,
): Promise<Map<string, EnrollmentView>> {
  if (studentIds.length === 0) return new Map();

  const results = await Promise.all(
    studentIds.map((id) =>
      getActiveEnrollment(id, academicYear).then((v) => [id, v] as const),
    ),
  );

  const map = new Map<string, EnrollmentView>();
  for (const [id, view] of results) {
    if (view) map.set(id, view);
  }
  return map;
}
