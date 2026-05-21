import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getCurrentSchoolId } from "@/lib/school";
import { db } from "@/db";
import {
  classes,
  enrollments,
  schools,
  studentGuardians,
  students,
} from "@/db/schema";
import { listAnnouncementsForGuardianAction } from "@/features/announcements/actions";
import { getStudentAttendanceCalendarAction } from "@/features/attendance/actions";
import type { Division } from "@/features/auth/types";
import ParentDashboardOverview from "./DashboardOverview";

export default async function ParentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const schoolId = await getCurrentSchoolId();
  const currentYear = await getCurrentAcademicYear();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });

  const links = await db.query.studentGuardians.findMany({
    where: eq(studentGuardians.guardianId, user.linkedId),
  });
  const childIds = links.map((l) => l.studentId);

  const childRows = childIds.length === 0
    ? []
    : await db.query.students.findMany({ where: inArray(students.id, childIds) });

  const enrollmentRows = childIds.length === 0
    ? []
    : await db
        .select({
          studentId: enrollments.studentId,
          classId: classes.id,
          className: classes.name,
          division: classes.division,
        })
        .from(enrollments)
        .innerJoin(classes, eq(classes.id, enrollments.classId))
        .where(
          and(
            inArray(enrollments.studentId, childIds),
            eq(enrollments.academicYear, currentYear),
            eq(enrollments.status, "Active")
          )
        );
  const enrollmentByStudent = new Map(
    enrollmentRows.map((e) => [e.studentId, e])
  );

  const linkedChildren = childRows.map((s) => {
    const enr = enrollmentByStudent.get(s.id);
    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      classId: enr?.classId ?? "",
      className: enr?.className ?? "",
      division: (enr?.division as Division) ?? "KG",
    };
  });

  const announcements = (await listAnnouncementsForGuardianAction(user.linkedId)).slice(0, 4);

  const firstChild = linkedChildren[0];
  let attendancePct: number | null = null;
  if (firstChild && firstChild.classId) {
    const records = await getStudentAttendanceCalendarAction(firstChild.id, firstChild.classId);
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    if (total > 0) attendancePct = Math.round((present / total) * 100);
  }

  return (
    <ParentDashboardOverview
      displayName={user.displayName}
      currentYear={currentYear}
      currentTerm={school?.currentTerm ?? 1}
      linkedChildren={linkedChildren}
      announcements={announcements}
      attendancePct={attendancePct}
    />
  );
}
