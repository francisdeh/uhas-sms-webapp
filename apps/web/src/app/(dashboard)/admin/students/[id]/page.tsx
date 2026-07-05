import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import StudentDetail from "@/features/students/components/StudentDetail";
import type { Student, ClassRecord } from "@/features/students/types";
import type { Division } from "@/features/auth/types";

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const api = await getApi();

  let studentRead;
  try {
    studentRead = await api.students.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const classesResp = await api.classes.list({ size: 200 });
  const classes: ClassRecord[] = classesResp.items.map((c) => ({
    id: c.id,
    name: c.name,
    division: c.division,
  }));

  const student: Student = {
    id: studentRead.id,
    slug: studentRead.slug,
    schoolId: studentRead.schoolId,
    firstName: studentRead.firstName,
    middleName: studentRead.middleName ?? undefined,
    lastName: studentRead.lastName,
    dob: studentRead.dob ?? "",
    gender: (studentRead.gender as "Male" | "Female") ?? "Male",
    classId: studentRead.classId ?? "",
    className: studentRead.className ?? "",
    division: (studentRead.division as Division) ?? "KG",
    phone: studentRead.phone ?? undefined,
    address: studentRead.address ?? undefined,
    nationality: studentRead.nationality ?? undefined,
    religion: studentRead.religion ?? undefined,
    photoUrl: studentRead.photoUrl ?? undefined,
    isActive: studentRead.isActive ?? true,
    createdAt: studentRead.createdAt ?? new Date().toISOString(),
  };

  // GAP: no `api.students.guardians(id)` endpoint yet — StudentRead
  // doesn't include a guardians array. Passing null keeps the detail
  // view rendering; the guardian card just shows the empty state.
  const guardian = null;

  return <StudentDetail student={student} classes={classes} guardian={guardian} />;
}
