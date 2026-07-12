import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { HeadOfSchoolReviewForm } from "@/features/exams/components/HeadOfSchoolReviewForm";
import { BatchPrintButton } from "@/features/exams/components/BatchPrintButton";
import type { Exam, ClassReportSubmission } from "@/features/exams/types";

interface PageProps {
  params: Promise<{ examId: string; classId: string }>;
}

export default async function AdminReviewClassPage({ params }: PageProps) {
  const { examId, classId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  let examRead;
  try {
    examRead = await api.exams.get(examId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let classRead;
  try {
    classRead = await api.classes.get(classId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  let classReport;
  try {
    classReport = await api.classReports.get(examId, classId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      classReport = null;
    } else {
      throw err;
    }
  }

  const exam: Exam = {
    id: examRead.id,
    schoolId: examRead.schoolId,
    name: examRead.name,
    type: examRead.type,
    term: examRead.term,
    academicYear: examRead.academicYear,
    isPublished: examRead.isPublished,
    publishedAt: examRead.publishedAt ?? null,
    createdAt: examRead.createdAt ?? new Date().toISOString(),
  };

  const submission: ClassReportSubmission | null = classReport?.id
    ? {
        id: classReport.id,
        examId: classReport.examId,
        classId: classReport.classId,
        status: classReport.status,
        submittedById: classReport.submittedById ?? null,
        submittedAt: classReport.submittedAt ?? null,
      }
    : null;

  // Aggregate computation used to happen server-side over per-student
  // scores. The class-report endpoint doesn't expose scores yet, so
  // per-student aggregates are unknown here — the reviewer form only
  // needs student names + existing remarks. See "gaps" in the parent
  // agent's rewire notes.
  const initialRows = (classReport?.remarks ?? []).map((r) => ({
    studentId: r.studentId,
    studentName: `${r.studentFirstName} ${r.studentLastName}`,
    aggregate: null,
    classTeacherRemark: r.text ?? "",
    headOfSchoolComment: classReport?.hosComment ?? "",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link
          href={`/admin/examinations/${examId}/review`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} className="mr-1" /> Back to classes
        </Link>
        <BatchPrintButton examId={examId} classId={classId} />
      </div>
      <HeadOfSchoolReviewForm
        exam={exam}
        className={classRead.name}
        submission={submission}
        initialRows={initialRows}
      />
    </div>
  );
}
