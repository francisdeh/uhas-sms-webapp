import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import SubjectsTable from "@/features/classes/components/SubjectsTable";

export default async function AdminSubjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Access gated at the route level — Admin only per proxy rules.
  return <SubjectsTable />;
}
