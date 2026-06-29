import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listClassesAction } from "@/features/classes/actions";
import { listAllSessionsAction } from "@/features/attendance/actions";
import { TeacherClassList } from "@/features/attendance/components/TeacherClassList";

export default async function TeacherAttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const allClasses = await listClassesAction();
  const myClasses = allClasses.filter((c) =>
    c.classTeachers.some((t) => t.staffId === user.linkedId)
  );

  const today = new Date().toISOString().split("T")[0];

  const todaySessions = await listAllSessionsAction({ from: today, to: today });
  const todaySessionMap: Record<string, boolean> = {};
  for (const cls of myClasses) {
    todaySessionMap[cls.id] = todaySessions.some((s) => s.classId === cls.id);
  }

  return (
    <TeacherClassList
      classes={myClasses}
      todaySessions={todaySessionMap}
      listHref="/teacher/attendance"
    />
  );
}
