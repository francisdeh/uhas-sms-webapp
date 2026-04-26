import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudents } from "@/lib/mock/students";
import { mockClasses } from "@/lib/mock/classes";
import { listAllSessionsAction } from "@/features/attendance/actions";
import TeacherDashboardOverview from "./DashboardOverview";

export default async function TeacherPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const myClasses = mockClasses.filter((c) => c.classTeacherId === user.linkedId);
  const myClassIds = new Set(myClasses.map((c) => c.id));

  const myStudents = mockStudents.filter(
    (s) => myClassIds.has(s.classId) && s.isActive
  ).length;

  const studentCountByClass = Object.fromEntries(
    myClasses.map((c) => [
      c.id,
      mockStudents.filter((s) => s.classId === c.id && s.isActive).length,
    ])
  );

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = await listAllSessionsAction({ from: today, to: today });
  const submittedClassIds = new Set(todaySessions.map((s) => s.classId));
  const submittedCount = myClasses.filter((c) => submittedClassIds.has(c.id)).length;

  return (
    <TeacherDashboardOverview
      displayName={user.displayName}
      stats={{ students: myStudents, classes: myClasses.length }}
      myClasses={myClasses}
      studentCountByClass={studentCountByClass}
      todayAttendance={{ submitted: submittedCount, total: myClasses.length }}
    />
  );
}
