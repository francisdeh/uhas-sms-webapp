import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listClassesAction } from "@/features/classes/actions";
import { listStudentsAction } from "@/features/students/actions";
import { getClassById } from "@/features/classes/queries/get-class-by-id";
import {
  getSessionForClassDateAction,
  listSessionsForClassAction,
  listAllSessionsAction,
} from "@/features/attendance/actions";
import { AttendanceSheet } from "@/features/attendance/components/AttendanceSheet";
import { SessionHistory } from "@/features/attendance/components/SessionHistory";

export default async function TeacherAttendanceClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { classId } = await params;
  const { date: dateParam } = await searchParams;

  const today = new Date().toISOString().split("T")[0];
  const date = dateParam ?? today;
  const editable = date === today;

  const schoolClass = await getClassById(classId);
  if (!schoolClass) notFound();

  const allStudents = await listStudentsAction();
  const students = allStudents.filter(
    (s) => s.classId === classId && s.isActive
  );

  const [existingSession, allSessions] = await Promise.all([
    getSessionForClassDateAction(classId, date),
    listSessionsForClassAction(classId),
  ]);

  return (
    <div className="space-y-6">
      <AttendanceSheet
        classId={classId}
        className={schoolClass.name}
        date={date}
        term={1}
        students={students}
        existingSession={existingSession}
        editable={editable}
        submittedById={user.linkedId}
      />
      <SessionHistory
        sessions={allSessions}
        basePath={`/teacher/attendance/${classId}`}
      />
    </div>
  );
}
