import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getCurrentSchoolId } from "@/lib/school";
import { db } from "@/db";
import {
  classes,
  classTeachers,
  enrollments,
  schools,
  students,
} from "@/db/schema";
import {
  getClassTeachersFor,
  toSchoolClass,
} from "@/features/classes/queries/get-class-by-id";
import { listAllSessionsAction } from "@/features/attendance/actions";
import TeacherDashboardOverview from "./DashboardOverview";

export default async function TeacherPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const schoolId = await getCurrentSchoolId();
  const currentYear = await getCurrentAcademicYear();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });

  // Classes the user is a class teacher for this year
  const myClassesRows = await db
    .select({
      id: classes.id,
      schoolId: classes.schoolId,
      name: classes.name,
      division: classes.division,
      academicYear: classes.academicYear,
    })
    .from(classTeachers)
    .innerJoin(classes, eq(classes.id, classTeachers.classId))
    .where(
      and(
        eq(classTeachers.staffId, user.linkedId),
        eq(classes.academicYear, currentYear)
      )
    );
  const classIds = myClassesRows.map((c) => c.id);
  const teachersMap = await getClassTeachersFor(classIds);
  const myClasses = myClassesRows.map((c) =>
    toSchoolClass(
      // The select shape matches what toSchoolClass expects (drizzle row of classes).
      c as unknown as typeof classes.$inferSelect,
      teachersMap.get(c.id) ?? []
    )
  );

  // Active enrollments in those classes
  let myStudents = 0;
  const studentCountByClass: Record<string, number> = {};
  if (classIds.length > 0) {
    const rows = await db
      .select({ classId: enrollments.classId })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(
        and(
          inArray(enrollments.classId, classIds),
          eq(enrollments.academicYear, currentYear),
          eq(enrollments.status, "Active"),
          eq(students.isActive, true)
        )
      );
    for (const r of rows) {
      studentCountByClass[r.classId] = (studentCountByClass[r.classId] ?? 0) + 1;
      myStudents++;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = await listAllSessionsAction({ from: today, to: today });
  const submittedClassIds = new Set(todaySessions.map((s) => s.classId));
  const submittedCount = myClasses.filter((c) => submittedClassIds.has(c.id)).length;

  return (
    <TeacherDashboardOverview
      displayName={user.displayName}
      currentYear={currentYear}
      currentTerm={school?.currentTerm ?? 1}
      stats={{ students: myStudents, classes: myClasses.length }}
      myClasses={myClasses}
      studentCountByClass={studentCountByClass}
      todayAttendance={{ submitted: submittedCount, total: myClasses.length }}
    />
  );
}
