import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { ReportCardPage } from "@/features/exams/components/ReportCardPage";
import type { ReportCardData } from "@/features/exams/types";

interface PageProps {
  params: Promise<{ studentId: string; examId: string }>;
}

export default async function ParentReportCardRoute({ params }: PageProps) {
  const { studentId, examId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  let data: ReportCardData;
  try {
    const raw = await api.studentViews.reportCard(studentId, examId);
    data = raw as unknown as ReportCardData;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      notFound();
    }
    throw err;
  }

  if (!data.exam.isPublished) notFound();
  return <ReportCardPage data={data} backHref="/parent/results" />;
}
