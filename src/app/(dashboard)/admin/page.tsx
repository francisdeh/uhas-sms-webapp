import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockClasses } from "@/lib/mock/classes";
import { mockAnnouncements } from "@/lib/mock/announcements";
import { mockSchool } from "@/lib/mock/school";
import AdminDashboardOverview from "./DashboardOverview";

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const currentYear = await getCurrentAcademicYear();
  const currentTerm = mockSchool.currentTerm;

  const activeStudents = mockStudents.filter((s) => s.isActive);
  const activeStaff = mockStaff.filter((s) => s.isActive).length;
  const classesThisYear = mockClasses.filter((c) => c.academicYear === currentYear);
  const criticalAnnouncements = mockAnnouncements.filter((a) => a.isCritical).length;

  const stats = [
    {
      label: "Total Students",
      value: activeStudents.length,
      icon: "students" as const,
      iconClass: "bg-blue-50 text-blue-600",
      trend: "+3 this term",
      href: "/admin/students",
    },
    {
      label: "Total Staff",
      value: activeStaff,
      icon: "staff" as const,
      iconClass: "bg-orange-50 text-accent-orange",
      trend: "Fully staffed",
      href: "/admin/staff",
    },
    {
      label: "Active Classes",
      value: classesThisYear.length,
      icon: "classes" as const,
      iconClass: "bg-green-50 text-green-600",
      trend: `${currentYear} · KG · Primary · JHS`,
      href: "/admin/classes",
    },
    {
      label: "Critical Alerts",
      value: criticalAnnouncements,
      icon: "alerts" as const,
      iconClass: "bg-red-50 text-red-500",
      trend: "Requires attention",
      href: "/admin/announcements",
    },
  ];

  const divisionBreakdown = [
    { label: "KG", count: activeStudents.filter((s) => s.division === "KG").length, color: "bg-purple-400" },
    { label: "Lower Primary", count: activeStudents.filter((s) => s.division === "Lower Primary").length, color: "bg-sky-400" },
    { label: "Upper Primary", count: activeStudents.filter((s) => s.division === "Upper Primary").length, color: "bg-blue-400" },
    { label: "JHS", count: activeStudents.filter((s) => s.division === "JHS").length, color: "bg-accent-orange" },
  ];

  const classOptions = mockClasses.map((c) => ({ id: c.id, name: c.name }));

  return (
    <AdminDashboardOverview
      currentYear={currentYear}
      currentTerm={currentTerm}
      totalActiveStudents={activeStudents.length}
      stats={stats}
      recentAnnouncements={mockAnnouncements.slice(0, 5)}
      classOptions={classOptions}
      divisionBreakdown={divisionBreakdown}
    />
  );
}
