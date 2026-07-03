import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { AssignmentsList } from "@/features/assignments/components/AssignmentsList";
import type { Assignment } from "@/features/assignments/types";

export default async function TeacherAssignmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const assignments = (await api.assignments.list({ size: 200 }))
    .items as unknown as Assignment[];

  return <AssignmentsList assignments={assignments} baseHref="/teacher/assignments" />;
}
