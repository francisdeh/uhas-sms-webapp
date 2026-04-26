import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import {
  listStudentsAction,
  listClassesAction,
  getStudentGuardianAction,
} from "@/features/students/actions";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import StudentDetail from "@/features/students/components/StudentDetail";

export default async function DeputyHeadStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;

  const division = await getDeputyHeadDivision(user.linkedId);

  const [students, classes, guardian] = await Promise.all([
    listStudentsAction(division),
    listClassesAction(division),
    getStudentGuardianAction(id),
  ]);

  const student = students.find((s) => s.id === id);
  if (!student) notFound();

  return <StudentDetail student={student} classes={classes} guardian={guardian} />;
}
