import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listStudentsAction } from "@/features/students/actions";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import StudentsTable from "@/features/students/components/StudentsTable";

export default async function DeputyHeadStudentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);

  const students = await listStudentsAction(division);

  return (
    <StudentsTable
      initialStudents={students}
      division={division}
      listHref="/deputy-head/students"
    />
  );
}
