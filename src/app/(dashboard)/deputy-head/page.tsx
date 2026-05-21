import { redirect, notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getCurrentSchoolId } from "@/lib/school";
import { db } from "@/db";
import {
  classes,
  enrollments,
  schools,
  staff,
  students,
} from "@/db/schema";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getStaffSessionForDivisionDateAction } from "@/features/attendance/actions";
import { toStaff } from "@/features/staff/queries/get-staff-by-id";
import DeputyHeadDashboardOverview from "./DashboardOverview";

export default async function DeputyHeadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) notFound();

  const schoolId = await getCurrentSchoolId();
  const currentYear = await getCurrentAcademicYear();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });

  const divisionClassesRows = await db.query.classes.findMany({
    where: and(
      eq(classes.schoolId, schoolId),
      eq(classes.division, division),
      eq(classes.academicYear, currentYear)
    ),
  });
  const classIds = divisionClassesRows.map((c) => c.id);

  let divisionStudents = 0;
  if (classIds.length > 0) {
    const rows = await db
      .select({ id: students.id })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(
        and(
          eq(enrollments.academicYear, currentYear),
          eq(enrollments.status, "Active"),
          eq(students.isActive, true)
        )
      );
    divisionStudents = rows.length;
  }

  const divisionStaffRows = await db.query.staff.findMany({
    where: and(
      eq(staff.schoolId, schoolId),
      eq(staff.division, division),
      eq(staff.isActive, true)
    ),
    orderBy: [asc(staff.lastName)],
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayStaffSession = await getStaffSessionForDivisionDateAction(division, today);

  return (
    <DeputyHeadDashboardOverview
      division={division}
      displayName={user.displayName}
      currentYear={currentYear}
      currentTerm={school?.currentTerm ?? 1}
      stats={{
        students: divisionStudents,
        staff: divisionStaffRows.length,
        classes: divisionClassesRows.length,
      }}
      staffList={divisionStaffRows.slice(0, 5).map(toStaff)}
      staffAttendanceToday={todayStaffSession !== null}
    />
  );
}
