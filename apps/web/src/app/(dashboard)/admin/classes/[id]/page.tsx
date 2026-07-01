import { redirect } from "next/navigation";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import ClassDetail from "@/features/classes/components/ClassDetail";

export default async function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  // All data (class + subjects + teachers + roster + pickers) is
  // fetched client-side via TanStack Query hooks inside ClassDetail.
  // Notfound handling lives in the hook's error state.
  return <ClassDetail classId={id} />;
}
