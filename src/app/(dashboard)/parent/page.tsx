import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { mockStudents } from "@/lib/mock/students";
import { mockClasses } from "@/lib/mock/classes";
import { mockAnnouncements } from "@/lib/mock/announcements";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockSchool } from "@/lib/mock/school";
import { getStudentAttendanceCalendarAction } from "@/features/attendance/actions";
import ParentDashboardOverview from "./DashboardOverview";

export default async function ParentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const childIds = mockStudentGuardians[user.linkedId] ?? [];

  const linkedChildren = childIds.flatMap((id) => {
    const student = mockStudents.find((s) => s.id === id);
    if (!student) return [];
    const schoolClass = mockClasses.find((c) => c.id === student.classId);
    return [{
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      classId: student.classId,
      className: schoolClass?.name ?? student.className,
      division: student.division,
    }];
  });

  const announcements = mockAnnouncements.slice(0, 4);

  const firstChild = linkedChildren[0];
  let attendancePct: number | null = null;
  if (firstChild) {
    const records = await getStudentAttendanceCalendarAction(firstChild.id, firstChild.classId);
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    if (total > 0) attendancePct = Math.round((present / total) * 100);
  }

  const currentYear = await getCurrentAcademicYear();

  return (
    <ParentDashboardOverview
      displayName={user.displayName}
      currentYear={currentYear}
      currentTerm={mockSchool.currentTerm}
      linkedChildren={linkedChildren}
      announcements={announcements}
      attendancePct={attendancePct}
    />
  );
}
