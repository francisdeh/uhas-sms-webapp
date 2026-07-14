import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi, ApiError } from "@/lib/api/server";
import StudentDetail from "@/features/students/components/StudentDetail";
import {
  MALE,
  type Student,
  type ClassRecord,
} from "@/features/students/types";
import { KG } from "@/features/auth/types";

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

  const classesPage = await api.classes.list({ division, size: 200 });

  const student: Student = {
    id: studentRead.id,
    slug: studentRead.slug,
    schoolId: studentRead.schoolId,
    firstName: studentRead.firstName,
    middleName: studentRead.middleName ?? undefined,
    lastName: studentRead.lastName,
    dob: studentRead.dob ?? "",
    gender: (studentRead.gender ?? MALE) as Student["gender"],
    classId: studentRead.classId ?? "",
    className: studentRead.className ?? "",
    division: (studentRead.division ?? KG) as Student["division"],
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

  return (
    <StudentDetail
      student={student}
      classes={classes}
      basePath="/deputy-head/students"
      canEdit={false}
    />
  );
}
