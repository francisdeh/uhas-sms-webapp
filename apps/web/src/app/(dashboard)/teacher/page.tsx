import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import TeacherDashboardOverview from "./DashboardOverview";
import type { SchoolClass } from "@/features/classes/types";

export default async function TeacherPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const teacherId = user.linkedId;

  const api = await getApi();
  const [school, allClassesPage, todaySessionsPage] = await Promise.all([
    api.school.get(),
    api.classes.list({ size: 500 }),
    api.attendance.listSessions({ size: 500 }),
  ]);

  // Fetch teachers for every class in parallel and keep those where the
  // current user is a class teacher. There's no direct API to list
  // "classes I class-teach" today (see GAPs).
  const perClass = await Promise.all(
    allClassesPage.items.map(async (c) => ({
      class: c,
      teachers: (await api.classes.teachers.list(c.id)).items,
    })),
  );

  const myClassEntries = perClass.filter((e) =>
    e.teachers.some((t) => t.staffId === teacherId),
  );

  const myClasses: SchoolClass[] = myClassEntries.map(({ class: c, teachers }) => ({
    id: c.id,
    schoolId: c.schoolId,
    name: c.name,
    division: c.division,
    academicYear: c.academicYear,
    classTeachers: teachers.map((t) => ({
      staffId: t.staffId,
      staffName: `${t.staffFirstName} ${t.staffLastName}`.trim(),
      isPrimary: t.isPrimary,
    })),
  }));

  const studentCountByClass: Record<string, number> = {};
  let myStudents = 0;
  for (const c of myClasses) {
    const count =
      myClassEntries.find((e) => e.class.id === c.id)?.class.studentCount ?? 0;
    studentCountByClass[c.id] = count;
    myStudents += count;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = todaySessionsPage.items.filter((s) => s.date === today);
  const submittedClassIds = new Set(todaySessions.map((s) => s.classId));
  const submittedCount = myClasses.filter((c) => submittedClassIds.has(c.id)).length;

  return (
    <TeacherDashboardOverview
      displayName={user.displayName}
      currentYear={school.academicYear}
      currentTerm={school.currentTerm ?? 1}
      stats={{ students: myStudents, classes: myClasses.length }}
      myClasses={myClasses}
      studentCountByClass={studentCountByClass}
      todayAttendance={{ submitted: submittedCount, total: myClasses.length }}
    />
  );
}
