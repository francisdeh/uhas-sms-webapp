import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getApi } from "@/lib/api/server";
import type { Announcement } from "@/features/announcements/types";
import type { Division } from "@/features/auth/types";
import ParentDashboardOverview from "./DashboardOverview";

function academicYearRange(year: string): { start: string; end: string } {
  const [startYear, endYear] = year.split("/");
  return { start: `${startYear}-09-01`, end: `${endYear}-08-31` };
}

export default async function ParentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const currentYear = await getCurrentAcademicYear();
  const api = await getApi();
  const school = await api.school.get();

  const { items: childRows } = user.linkedId
    ? await api.guardians.children(user.linkedId)
    : { items: [] };

  const linkedChildren = childRows.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: `${s.firstName} ${s.lastName}`,
    classId: s.classId ?? "",
    className: s.className ?? "",
    division: (s.division as Division) ?? "KG",
  }));

  const announcementsPage = await api.announcements.list({ size: 4 });
  const announcements = announcementsPage.items.slice(0, 4) as unknown as Announcement[];

  const firstChild = linkedChildren[0];
  let attendancePct: number | null = null;
  if (firstChild && firstChild.classId) {
    const { start, end } = academicYearRange(currentYear);
    const records = await api.studentViews.attendanceCalendar(firstChild.id, {
      termStart: start,
      termEnd: end,
    });
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    if (total > 0) attendancePct = Math.round((present / total) * 100);
  }

  return (
    <ParentDashboardOverview
      displayName={user.displayName}
      currentYear={currentYear}
      currentTerm={school?.currentTerm ?? 1}
      linkedChildren={linkedChildren}
      announcements={announcements}
      attendancePct={attendancePct}
    />
  );
}
