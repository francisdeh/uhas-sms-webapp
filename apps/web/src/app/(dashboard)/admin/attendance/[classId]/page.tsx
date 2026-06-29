import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listStudentsAction } from "@/features/students/actions";
import { getClassById } from "@/features/classes/queries/get-class-by-id";
import { getSessionForClassDateAction } from "@/features/attendance/actions";
import { AttendanceSheet } from "@/features/attendance/components/AttendanceSheet";

export default async function AdminAttendanceClassPage({
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

  const schoolClass = await getClassById(classId);
  if (!schoolClass) notFound();

  const allStudents = await listStudentsAction();
  const students = allStudents.filter(
    (s) => s.classId === classId && s.isActive
  );

  const existingSession = await getSessionForClassDateAction(classId, date);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/attendance"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ChevronLeft size={14} /> Back to picker
        </Link>
      </div>
      <AttendanceSheet
        classId={classId}
        className={schoolClass.name}
        date={date}
        term={1}
        students={students}
        existingSession={existingSession}
        editable={true}
        submittedById={user.linkedId}
      />
    </div>
  );
}
