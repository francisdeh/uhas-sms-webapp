import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi, ApiError } from "@/lib/api/server";
import DeputyHeadDashboardOverview from "./DashboardOverview";
import type { Staff } from "@/features/staff/types";

export default async function DeputyHeadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) notFound();

  const api = await getApi();
  const today = new Date().toISOString().slice(0, 10);

  const [school, stats, staffPage, todayStaffSession] = await Promise.all([
    api.school.get(),
    api.reports.getDivisionStats(division),
    api.staff.list({ size: 500 }),
    // 404 → today's session hasn't been submitted yet; treat as null.
    api.staffAttendance
      .lookupSession({ division, date: today })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
  ]);

  const allStaff = staffPage.items as unknown as Staff[];
  const divisionStaff = allStaff
    .filter((s) => s.division === division && s.isActive)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  const staffAttendanceToday = todayStaffSession
    ? {
        present: todayStaffSession.records.filter((r) =>
          ["Present", "Late"].includes(r.status),
        ).length,
        total: todayStaffSession.records.length,
      }
    : null;

  return (
    <DeputyHeadDashboardOverview
      division={division}
      displayName={user.displayName}
      currentYear={school.academicYear}
      currentTerm={school.currentTerm ?? 1}
      stats={{
        students: stats.students,
        staff: stats.staff,
        classes: stats.classes,
        pendingLessonPlans: stats.lessonPlans.submitted,
      }}
      staffList={divisionStaff.slice(0, 5)}
      staffAttendanceToday={staffAttendanceToday}
    />
  );
}
