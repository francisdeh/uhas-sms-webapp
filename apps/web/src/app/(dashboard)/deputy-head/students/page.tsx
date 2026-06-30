import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import StudentsTable from "@/features/students/components/StudentsTable";

export default async function DeputyHeadStudentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  const api = await getApi();
  const initialData = await api.students.list({ division, size: 100 });

  return (
    <StudentsTable
      initialData={initialData}
      division={division}
      listHref="/deputy-head/students"
    />
  );
}
