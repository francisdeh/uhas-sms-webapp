import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import ClassesTable from "@/features/classes/components/ClassesTable";

export default async function AdminClassesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <ClassesTable listHref="/admin/classes" />;
}
