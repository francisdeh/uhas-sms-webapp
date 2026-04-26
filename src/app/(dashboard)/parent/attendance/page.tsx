import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockStudents } from "@/lib/mock/students";
import { mockClasses } from "@/lib/mock/classes";
import { getStudentAttendanceCalendarAction } from "@/features/attendance/actions";
import ParentAttendanceView from "@/features/attendance/components/ParentAttendanceView";

interface Props {
  searchParams: Promise<{ studentId?: string }>;
}

export default async function ParentAttendancePage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const guardianId = user.linkedId ?? "";
  const childIds = mockStudentGuardians[guardianId] ?? [];
  if (childIds.length === 0) notFound();

  const students = childIds.flatMap((id) => {
    const student = mockStudents.find((s) => s.id === id);
    if (!student) return [];
    const cls = mockClasses.find((c) => c.id === student.classId);
    return [
      {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        classId: student.classId,
        className: cls?.name ?? student.className,
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

  const records = await getStudentAttendanceCalendarAction(
    selectedStudent.id,
    selectedStudent.classId
  );

  return (
    <ParentAttendanceView
      students={students}
      selectedStudentId={selectedStudentId}
      records={records}
    />
  );
}
