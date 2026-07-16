import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import StudentDetail from "@/features/students/components/StudentDetail";
import { MALE, type Student } from "@/features/students/types";
import { KG } from "@/features/auth/types";

export default async function TeacherStudentDetailPage({
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
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  const schoolRead = await api.school.get();

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

  return (
    <StudentDetail
      student={student}
      classes={[]}
      basePath="/teacher/students"
      canEdit={false}
      school={{ name: schoolRead.name, logoUrl: schoolRead.logoUrl ?? null }}
    />
  );
}
