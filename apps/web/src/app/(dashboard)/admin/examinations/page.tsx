import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listExamsAction } from "@/features/exams/actions";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { ExamsManager } from "@/features/exams/components/ExamsManager";

export default async function AdminExaminationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [exams, currentYear] = await Promise.all([
    listExamsAction(),
    getCurrentAcademicYear(),
  ]);

  return <ExamsManager initialExams={exams} currentYear={currentYear} />;
}
