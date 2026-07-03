import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import AdminDashboardOverview from "./DashboardOverview";
import type { Announcement } from "@/features/announcements/types";

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const currentYear = await getCurrentAcademicYear();
  const [stats, school, classesResp, announcementsResp] = await Promise.all([
    api.reports.getSchoolStats(),
    api.school.get(),
    api.classes.list({ academicYear: currentYear, size: 200 }),
    api.announcements.list({ size: 100 }),
  ]);

  const currentTerm = school.currentTerm ?? 1;

  const divisionBreakdown = [
    { label: "KG", count: 0, color: "bg-purple-400" },
    { label: "Lower Primary", count: 0, color: "bg-sky-400" },
    { label: "Upper Primary", count: 0, color: "bg-blue-400" },
    { label: "JHS", count: 0, color: "bg-accent-orange" },
  ];
  for (const div of stats.divisions) {
    const entry = divisionBreakdown.find((d) => d.label === div.division);
    if (entry) entry.count = div.students;
  }

  const totalActiveStudents = stats.totals.activeStudents;
  const criticalCount = announcementsResp.items.filter((a) => a.isCritical).length;

  const statCards = [
    {
      label: "Total Students",
      value: totalActiveStudents,
      icon: "students" as const,
      iconClass: "bg-blue-50 text-blue-600",
      trend: "+3 this term",
      href: "/admin/students",
    },
    {
      label: "Total Staff",
      value: stats.totals.activeStaff,
      icon: "staff" as const,
      iconClass: "bg-orange-50 text-accent-orange",
      trend: "Fully staffed",
      href: "/admin/staff",
    },
    {
      label: "Active Classes",
      value: stats.totals.classes,
      icon: "classes" as const,
      iconClass: "bg-green-50 text-green-600",
      trend: `${currentYear} · KG · Primary · JHS`,
      href: "/admin/classes",
    },
    {
      label: "Critical Alerts",
      value: criticalCount,
      icon: "alerts" as const,
      iconClass: "bg-red-50 text-red-500",
      trend: "Requires attention",
      href: "/admin/announcements",
    },
  ];

  const classOptions = classesResp.items.map((c) => ({ id: c.id, name: c.name }));

  const recentAnnouncements: Announcement[] = announcementsResp.items
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      schoolId: a.schoolId,
      title: a.title,
      body: a.body,
      audience: a.audience,
      isCritical: a.isCritical,
      createdById: a.createdById,
      createdByName: a.createdByName,
      createdAt: a.createdAt ?? new Date().toISOString(),
    }));

  return (
    <AdminDashboardOverview
      currentYear={currentYear}
      currentTerm={currentTerm}
      totalActiveStudents={totalActiveStudents}
      stats={statCards}
      recentAnnouncements={recentAnnouncements}
      classOptions={classOptions}
      divisionBreakdown={divisionBreakdown}
    />
  );
}
