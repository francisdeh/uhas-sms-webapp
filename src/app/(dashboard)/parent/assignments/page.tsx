import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockStudents } from "@/lib/mock/students";
import { listAssignmentsForStudentsAction } from "@/features/assignments/actions";
import { ParentAssignmentsList } from "@/features/assignments/components/ParentAssignmentsList";

export default async function ParentAssignmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const childIds = mockStudentGuardians[user.linkedId] ?? [];
  const children = childIds
    .map((id) => mockStudents.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const assignments = await listAssignmentsForStudentsAction(childIds);

  const childNames: Record<string, string> = {};
  const classChildIds: Record<string, string[]> = {};
  for (const c of children) {
    childNames[c.id] = `${c.firstName} ${c.lastName}`;
    (classChildIds[c.classId] ??= []).push(c.id);
  }

  return (
    <ParentAssignmentsList
      assignments={assignments}
      childNames={childNames}
      classChildIds={classChildIds}
    />
  );
}
