import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listStudentsAction } from "@/features/students/actions";
import { mockStaff } from "@/lib/mock/staff";
import StudentsTable from "@/features/students/components/StudentsTable";

export default async function DeputyHeadStudentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const staffMember = mockStaff.find((s) => s.id === user.linkedId);
  const division = (staffMember?.division ?? undefined) as
    | "KG"
    | "Primary"
    | "JHS"
    | undefined;

  const students = await listStudentsAction(division);

  return (
    <StudentsTable
      initialStudents={students}
      division={division}
      listHref="/deputy-head/students"
    />
  );
}
