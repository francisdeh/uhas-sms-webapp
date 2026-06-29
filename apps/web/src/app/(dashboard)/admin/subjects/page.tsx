import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listSubjectsAction } from "@/features/classes/actions";
import SubjectsTable from "@/features/classes/components/SubjectsTable";

export default async function AdminSubjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const subjects = await listSubjectsAction();

  return <SubjectsTable initialSubjects={subjects} />;
}
