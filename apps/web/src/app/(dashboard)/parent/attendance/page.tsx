import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getApi } from "@/lib/api/server";
import ParentAttendanceView from "@/features/attendance/components/ParentAttendanceView";
import type { AttendanceStatus } from "@/features/attendance/types";

interface Props {
  searchParams: Promise<{ studentId?: string }>;
}

function academicYearRange(year: string): { start: string; end: string } {
  const [startYear, endYear] = year.split("/");
  return { start: `${startYear}-09-01`, end: `${endYear}-08-31` };
}

export default async function ParentAttendancePage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const guardianId = user.linkedId ?? "";
  const year = await getCurrentAcademicYear();
  const api = await getApi();

  if (!guardianId) notFound();
  const { items: childRows } = await api.guardians.children(guardianId);
  const childIds = childRows.map((s) => s.id);
  if (childIds.length === 0) notFound();

  const students = childRows.flatMap((s) => {
    if (!s.classId || !s.className) return [];
    return [
      {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        classId: s.classId,
        className: s.className,
      },
    ];
  });

  if (students.length === 0) notFound();

  const { studentId: rawStudentId } = await searchParams;

  if (rawStudentId && !childIds.includes(rawStudentId)) {
    redirect("/parent/attendance");
  }

  const selectedStudentId = rawStudentId ?? students[0].id;
  const selectedStudent = students.find((s) => s.id === selectedStudentId)!;

  const { start, end } = academicYearRange(year);
  const rawRecords = await api.studentViews.attendanceCalendar(selectedStudent.id, {
    termStart: start,
    termEnd: end,
  });
  const records = rawRecords as unknown as { date: string; status: AttendanceStatus }[];

  return (
    <ParentAttendanceView
      students={students}
      selectedStudentId={selectedStudentId}
      records={records}
    />
  );
}
