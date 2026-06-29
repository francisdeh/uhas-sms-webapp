import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listAssignmentsForTeacherAction } from "@/features/assignments/actions";
import { AssignmentsList } from "@/features/assignments/components/AssignmentsList";

export default async function TeacherAssignmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const assignments = await listAssignmentsForTeacherAction(user.linkedId);

  return <AssignmentsList assignments={assignments} baseHref="/teacher/assignments" />;
}
