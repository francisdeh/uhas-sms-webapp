import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { ParentAssignmentsList } from "@/features/assignments/components/ParentAssignmentsList";
import type { Assignment } from "@/features/assignments/types";

export default async function ParentAssignmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const { items: children } = await api.guardians.children(user.linkedId);
  const childIds = children.map((c) => c.id);

  const assignments = childIds.length === 0
    ? []
    : ((await api.assignments.list({ forStudentIds: childIds, size: 100 })).items as unknown as Assignment[]);

  const childNames: Record<string, string> = {};
  const classChildIds: Record<string, string[]> = {};
  for (const c of children) {
    childNames[c.id] = `${c.firstName} ${c.lastName}`;
    if (c.classId) (classChildIds[c.classId] ??= []).push(c.id);
  }

  return (
    <ParentAssignmentsList
      assignments={assignments}
      childNames={childNames}
      classChildIds={classChildIds}
    />
  );
}
