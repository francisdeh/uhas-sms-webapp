import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockClasses } from "@/lib/mock/classes";
import { mockSchool } from "@/lib/mock/school";
import { getStaffSessionForDivisionDateAction } from "@/features/attendance/actions";
import DeputyHeadDashboardOverview from "./DashboardOverview";

export default async function DeputyHeadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) notFound();

  const divisionStudents = mockStudents.filter(
    (s) => s.division === division && s.isActive
  ).length;
  const divisionStaff = mockStaff.filter(
    (s) => s.division === division && s.isActive
  ).length;
  const currentYear = await getCurrentAcademicYear();

  const divisionClasses = mockClasses.filter(
    (c) => c.division === division && c.academicYear === currentYear
  ).length;

  const staffList = mockStaff
    .filter((s) => s.division === division && s.isActive)
    .slice(0, 5);

  const today = new Date().toISOString().slice(0, 10);
  const todayStaffSession = await getStaffSessionForDivisionDateAction(division, today);

  return (
    <DeputyHeadDashboardOverview
      division={division}
      displayName={user.displayName}
      currentYear={currentYear}
      currentTerm={mockSchool.currentTerm}
      stats={{ students: divisionStudents, staff: divisionStaff, classes: divisionClasses }}
      staffList={staffList}
      staffAttendanceToday={todayStaffSession !== null}
    />
  );
}
