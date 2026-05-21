import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { db } from "@/db";
import { enrollments, studentGuardians, students as studentsTable } from "@/db/schema";
import { listAssignmentsForStudentsAction } from "@/features/assignments/actions";
import { ParentAssignmentsList } from "@/features/assignments/components/ParentAssignmentsList";

export default async function ParentAssignmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const year = await getCurrentAcademicYear();

  const links = await db.query.studentGuardians.findMany({
    where: eq(studentGuardians.guardianId, user.linkedId),
  });
  const childIds = links.map((l) => l.studentId);

  const children = childIds.length === 0
    ? []
    : await db.query.students.findMany({ where: inArray(studentsTable.id, childIds) });

  const enrRows = childIds.length === 0
    ? []
    : await db
        .select({ studentId: enrollments.studentId, classId: enrollments.classId })
        .from(enrollments)
        .where(
          and(
            inArray(enrollments.studentId, childIds),
            eq(enrollments.academicYear, year),
            eq(enrollments.status, "Active")
          )
        );
  const classIdByStudent = new Map(enrRows.map((e) => [e.studentId, e.classId]));

  const assignments = await listAssignmentsForStudentsAction(childIds);

  const childNames: Record<string, string> = {};
  const classChildIds: Record<string, string[]> = {};
  for (const c of children) {
    childNames[c.id] = `${c.firstName} ${c.lastName}`;
    const classId = classIdByStudent.get(c.id);
    if (classId) (classChildIds[classId] ??= []).push(c.id);
  }

  return (
    <ParentAssignmentsList
      assignments={assignments}
      childNames={childNames}
      classChildIds={classChildIds}
    />
  );
}
