import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { db } from "@/db";
import { studentGuardians } from "@/db/schema";
import { getReportCardData } from "@/features/exams/queries/get-report-card";
import { ReportCardPage } from "@/features/exams/components/ReportCardPage";

interface PageProps {
  params: Promise<{ studentId: string; examId: string }>;
}

export default async function ParentReportCardRoute({ params }: PageProps) {
  const { studentId, examId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const link = await db.query.studentGuardians.findFirst({
    where: and(
      eq(studentGuardians.guardianId, user.linkedId),
      eq(studentGuardians.studentId, studentId)
    ),
  });
  if (!link) notFound();

  const data = await getReportCardData(studentId, examId);
  if (!data) notFound();
  if (!data.exam.isPublished) notFound();

  return <ReportCardPage data={data} backHref="/parent/results" />;
}
