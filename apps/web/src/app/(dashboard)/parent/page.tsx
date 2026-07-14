import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getApi } from "@/lib/api/server";
import type { Announcement } from "@/features/announcements/types";
import type { Division } from "@/features/auth/types";
import ParentDashboardOverview from "./DashboardOverview";

/** First term's start date to last term's end date for `year` — the
 *  real, Admin-configured range (same source report cards use), not a
 *  hardcoded Sept 1–Aug 31 guess. Falls back to that guess only when
 *  `year` has no school_terms rows configured yet. */
function academicYearRange(
  year: string,
  allTerms: { academicYear: string; term: number; startDate: string; endDate: string }[]
): { start: string; end: string } {
  const forYear = allTerms
    .filter((t) => t.academicYear === year)
    .sort((a, b) => a.term - b.term);
  if (forYear.length > 0) {
    return { start: forYear[0].startDate, end: forYear[forYear.length - 1].endDate };
  }
  const [startYear, endYear] = year.split("/");
  return { start: `${startYear}-09-01`, end: `${endYear}-08-31` };
}

export default async function ParentPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const currentYear = await getCurrentAcademicYear();
  const api = await getApi();
  const [school, termsResponse] = await Promise.all([api.school.get(), api.schoolTerms.list()]);

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
    const { start, end } = academicYearRange(currentYear, termsResponse.items);
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
