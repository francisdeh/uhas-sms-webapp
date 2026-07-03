import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi, ApiError } from "@/lib/api/server";
import StudentDetail from "@/features/students/components/StudentDetail";
import type {
  Student,
  ClassRecord,
} from "@/features/students/types";

export default async function DeputyHeadStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const division = await getDeputyHeadDivision(user.linkedId);

  const api = await getApi();
  let studentRead;
  try {
    studentRead = await api.students.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  // 403 if the student isn't in this DH's division.
  if (division && studentRead.division && studentRead.division !== division) {
    notFound();
  }

  const [classesPage, guardian] = await Promise.all([
    api.classes.list({ division, size: 200 }),
    api.students.guardian(id),
  ]);

  const student: Student = {
    id: studentRead.id,
    schoolId: studentRead.schoolId,
    firstName: studentRead.firstName,
    middleName: studentRead.middleName ?? undefined,
    lastName: studentRead.lastName,
    dob: studentRead.dob ?? "",
    gender: (studentRead.gender ?? "Male") as "Male" | "Female",
    classId: studentRead.classId ?? "",
    className: studentRead.className ?? "",
    division: (studentRead.division ?? "KG") as Student["division"],
    phone: studentRead.phone ?? undefined,
    address: studentRead.address ?? undefined,
    nationality: studentRead.nationality ?? undefined,
    religion: studentRead.religion ?? undefined,
    photoUrl: studentRead.photoUrl ?? undefined,
    isActive: studentRead.isActive ?? true,
    createdAt: studentRead.createdAt ?? new Date().toISOString(),
  };

  const classes: ClassRecord[] = classesPage.items.map((c) => ({
    id: c.id,
    name: c.name,
    division: c.division,
  }));

  const guardianProfile = guardian
    ? {
        id: guardian.id,
        name: guardian.name,
        relationship: guardian.relationship,
        phone: guardian.phone ?? undefined,
        email: guardian.email ?? undefined,
      }
    : null;

  return <StudentDetail student={student} classes={classes} guardian={guardianProfile} />;
}
