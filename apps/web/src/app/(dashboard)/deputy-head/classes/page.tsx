import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import ClassesTable from "@/features/classes/components/ClassesTable";

export default async function DeputyHeadClassesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // ClassesTable filters by division client-side via the API; the
  // deputy's division scope is enforced server-side by the JWT
  // (the token carries the deputy's `division` claim and the API
  // limits reads accordingly — no need to pass it as a prop).
  return <ClassesTable listHref="/deputy-head/classes" readonly />;
}
