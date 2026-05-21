import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getCurrentSchoolId } from "@/lib/school";
import { db } from "@/db";
import { schools, students, staff, classes, announcements } from "@/db/schema";
import { listAnnouncementsAction } from "@/features/announcements/actions";
import { getActiveEnrollmentMap } from "@/features/students/queries/get-active-enrollment";
import AdminDashboardOverview from "./DashboardOverview";

export default async function AdminDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const schoolId = await getCurrentSchoolId();
  const currentYear = await getCurrentAcademicYear();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const currentTerm = school?.currentTerm ?? 1;

  const [activeStudents, activeStaffRows, classesThisYear, criticalAnnouncementsRows, recentAnnouncements] = await Promise.all([
    db.query.students.findMany({
      where: and(eq(students.schoolId, schoolId), eq(students.isActive, true)),
    }),
    db.query.staff.findMany({
      where: and(eq(staff.schoolId, schoolId), eq(staff.isActive, true)),
    }),
    db.query.classes.findMany({
      where: and(eq(classes.schoolId, schoolId), eq(classes.academicYear, currentYear)),
    }),
    db.query.announcements.findMany({
      where: and(eq(announcements.schoolId, schoolId), eq(announcements.isCritical, true)),
    }),
    listAnnouncementsAction(),
  ]);

  const enrollmentMap = await getActiveEnrollmentMap(
    activeStudents.map((s) => s.id),
    currentYear
  );

  const divisionBreakdown = [
    { label: "KG", count: 0, color: "bg-purple-400" },
    { label: "Lower Primary", count: 0, color: "bg-sky-400" },
    { label: "Upper Primary", count: 0, color: "bg-blue-400" },
    { label: "JHS", count: 0, color: "bg-accent-orange" },
  ];
  for (const s of activeStudents) {
    const enr = enrollmentMap.get(s.id);
    if (!enr) continue;
    const entry = divisionBreakdown.find((d) => d.label === enr.division);
    if (entry) entry.count += 1;
  }

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
      value: activeStaffRows.length,
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
      value: criticalAnnouncementsRows.length,
      icon: "alerts" as const,
      iconClass: "bg-red-50 text-red-500",
      trend: "Requires attention",
      href: "/admin/announcements",
    },
  ];

  const classOptions = classesThisYear.map((c) => ({ id: c.id, name: c.name }));

  return (
    <AdminDashboardOverview
      currentYear={currentYear}
      currentTerm={currentTerm}
      totalActiveStudents={activeStudents.length}
      stats={stats}
      recentAnnouncements={recentAnnouncements.slice(0, 5)}
      classOptions={classOptions}
      divisionBreakdown={divisionBreakdown}
    />
  );
}
