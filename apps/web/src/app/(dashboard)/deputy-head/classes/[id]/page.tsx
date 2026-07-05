import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import ClassDetail from "@/features/classes/components/ClassDetail";

export default async function DeputyHeadClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // All data is fetched client-side via TanStack Query hooks inside
  // ClassDetail. Division scoping + the read-only mutation gate are
  // both enforced server-side (GET /classes/{id} 403s outside the
  // deputy's own division) — `readonly` here only hides UI the backend
  // would reject anyway.
  const { id } = await params;
  return <ClassDetail classId={id} readonly />;
}
