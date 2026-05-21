import { notFound, redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { db } from "@/db";
import { classes, enrollments, studentGuardians, students as studentsTable } from "@/db/schema";
import { getStudentAttendanceCalendarAction } from "@/features/attendance/actions";
import ParentAttendanceView from "@/features/attendance/components/ParentAttendanceView";

interface Props {
  searchParams: Promise<{ studentId?: string }>;
}

export default async function ParentAttendancePage({ searchParams }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const guardianId = user.linkedId ?? "";
  const year = await getCurrentAcademicYear();

  const links = await db.query.studentGuardians.findMany({
    where: eq(studentGuardians.guardianId, guardianId),
  });
  const childIds = links.map((l) => l.studentId);
  if (childIds.length === 0) notFound();

  const studentRows = await db.query.students.findMany({
    where: inArray(studentsTable.id, childIds),
  });

  const enrRows = await db
    .select({
      studentId: enrollments.studentId,
      classId: classes.id,
      className: classes.name,
    })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(
      and(
        inArray(enrollments.studentId, childIds),
        eq(enrollments.academicYear, year),
        eq(enrollments.status, "Active")
      )
    );
  const enrByStudent = new Map(enrRows.map((e) => [e.studentId, e]));

  const students = studentRows.flatMap((s) => {
    const enr = enrByStudent.get(s.id);
    if (!enr) return [];
    return [
      {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        classId: enr.classId,
        className: enr.className,
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
