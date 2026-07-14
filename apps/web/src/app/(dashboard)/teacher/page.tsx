import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import TeacherDashboardOverview from "./DashboardOverview";
import type { SchoolClass } from "@/features/classes/types";
import { LESSON_PLAN_STATUS } from "@/features/lesson-plans/types";

export default async function TeacherPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const teacherId = user.linkedId;

  const api = await getApi();
  const [school, myClassesPage, todaySessionsPage, lessonPlansPage] = await Promise.all([
    api.school.get(),
    teacherId
      ? api.classes.list({ classTeacherId: teacherId, size: 500 })
      : Promise.resolve({ items: [], total: 0, page: 1, size: 0 }),
    api.attendance.listSessions({ size: 500 }),
    teacherId
      ? api.lessonPlans.list({ teacherId, size: 200 })
      : Promise.resolve({ items: [], total: 0, page: 1, size: 0 }),
  ]);

  const myClasses: SchoolClass[] = myClassesPage.items.map((c) => ({
    id: c.id,
    schoolId: c.schoolId,
    name: c.name,
    division: c.division,
    academicYear: c.academicYear,
    classTeachers: [],
  }));

  const studentCountByClass: Record<string, number> = {};
  let myStudents = 0;
  for (const c of myClassesPage.items) {
    studentCountByClass[c.id] = c.studentCount ?? 0;
    myStudents += c.studentCount ?? 0;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = todaySessionsPage.items.filter((s) => s.date === today);
  const submittedClassIds = new Set(todaySessions.map((s) => s.classId));
  const submittedCount = myClasses.filter((c) => submittedClassIds.has(c.id)).length;

  const pendingLessonPlans = lessonPlansPage.items.filter(
    (p) => p.status === LESSON_PLAN_STATUS.DRAFT || p.status === LESSON_PLAN_STATUS.SUBMITTED,
  ).length;
  const rejectedLessonPlans = lessonPlansPage.items.filter(
    (p) => p.status === LESSON_PLAN_STATUS.REJECTED,
  ).length;

  return (
    <TeacherDashboardOverview
      displayName={user.displayName}
      currentYear={school.academicYear}
      currentTerm={school.currentTerm ?? 1}
      stats={{ students: myStudents, classes: myClasses.length }}
      myClasses={myClasses}
      studentCountByClass={studentCountByClass}
      todayAttendance={{ submitted: submittedCount, total: myClasses.length }}
      lessonPlans={{ pending: pendingLessonPlans, rejected: rejectedLessonPlans }}
    />
  );
}
