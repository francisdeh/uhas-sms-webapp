import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { getReportCardData } from "@/features/exams/queries/get-report-card";
import { ReportCardPage } from "@/features/exams/components/ReportCardPage";

interface PageProps {
  params: Promise<{ studentId: string; examId: string }>;
}

export default async function ParentReportCardRoute({ params }: PageProps) {
  const { studentId, examId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const allowedChildIds = mockStudentGuardians[user.linkedId] ?? [];
  if (!allowedChildIds.includes(studentId)) notFound();

  const data = await getReportCardData(studentId, examId);
  if (!data) notFound();

  // Parents only see published reports
  if (!data.exam.isPublished) notFound();

  return <ReportCardPage data={data} backHref="/parent/results" />;
}
