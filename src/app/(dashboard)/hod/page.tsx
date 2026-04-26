import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockClasses } from "@/lib/mock/classes";
import { mockSubjects } from "@/lib/mock/subjects";
import HODDashboardOverview from "./DashboardOverview";

export default async function HODPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const jhsStudents = mockStudents.filter((s) => s.division === "JHS" && s.isActive).length;
  const jhsStaff = mockStaff.filter((s) => s.division === "JHS" && s.isActive).length;
  const jhsSubjects = mockSubjects.filter((s) => s.division === "JHS").length;

  const jhsClasses = mockClasses.filter((c) => c.division === "JHS");

  return (
    <HODDashboardOverview
      displayName={user.displayName}
      stats={{ students: jhsStudents, staff: jhsStaff, subjects: jhsSubjects }}
      jhsClasses={jhsClasses}
    />
  );
}
