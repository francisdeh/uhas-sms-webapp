import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { db } from "@/db";
import {
  classes,
  enrollments,
  studentGuardians,
  students as studentsTable,
} from "@/db/schema";
import {
  listAppointmentsForGuardianAction,
  listTeachersForStudentAction,
} from "@/features/appointments/actions";
import { ParentAppointmentsView } from "@/features/appointments/components/ParentAppointmentsView";

export default async function ParentAppointmentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const year = await getCurrentAcademicYear();

  const links = await db.query.studentGuardians.findMany({
    where: eq(studentGuardians.guardianId, user.linkedId),
  });
  const childIds = links.map((l) => l.studentId);

  const childRows = childIds.length === 0
    ? []
    : await db.query.students.findMany({ where: inArray(studentsTable.id, childIds) });

  const enrRows = childIds.length === 0
    ? []
    : await db
        .select({ studentId: enrollments.studentId, className: classes.name })
        .from(enrollments)
        .innerJoin(classes, eq(classes.id, enrollments.classId))
        .where(
          and(
            inArray(enrollments.studentId, childIds),
            eq(enrollments.academicYear, year),
            eq(enrollments.status, "Active")
          )
        );
  const classNameByStudent = new Map(enrRows.map((e) => [e.studentId, e.className]));

  const childOptions = await Promise.all(
    childRows.map(async (c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      className: classNameByStudent.get(c.id) ?? "",
      teachers: await listTeachersForStudentAction(c.id),
    }))
  );

  const appointments = await listAppointmentsForGuardianAction(user.linkedId);

  return (
    <ParentAppointmentsView
      guardianId={user.linkedId}
      childOptions={childOptions}
      appointments={appointments}
    />
  );
}
