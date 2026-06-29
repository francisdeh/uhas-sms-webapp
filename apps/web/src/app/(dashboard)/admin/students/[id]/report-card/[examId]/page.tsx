import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getReportCardData } from "@/features/exams/queries/get-report-card";
import { ReportCardPage } from "@/features/exams/components/ReportCardPage";

interface PageProps {
  params: Promise<{ id: string; examId: string }>;
}

export default async function AdminReportCardRoute({ params }: PageProps) {
  const { id, examId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await getReportCardData(id, examId);
  if (!data) notFound();

  return (
    <ReportCardPage
      data={data}
      backHref={`/admin/students/${id}`}
      unpublishedNotice={!data.exam.isPublished}
    />
  );
}
