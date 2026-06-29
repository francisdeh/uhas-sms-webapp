import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listStudentsAction } from "@/features/students/actions";
import StudentsTable from "@/features/students/components/StudentsTable";

export default async function AdminStudentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const students = await listStudentsAction();

  return (
    <StudentsTable
      initialStudents={students}
      listHref="/admin/students"
    />
  );
}
