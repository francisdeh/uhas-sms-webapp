import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getClassById } from "@/features/classes/queries/get-class-by-id";
import { getApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/client";
import { ClassReportSubmitForm } from "@/features/exams/components/ClassReportSubmitForm";
import { ScoreCompletenessPanel } from "@/features/exams/components/ScoreCompletenessPanel";
import type { ClassReportSubmission } from "@/features/exams/types";

interface PageProps {
  params: Promise<{ examId: string; classId: string }>;
}

export default async function ClassReportSubmitPage({ params }: PageProps) {
  const { examId, classId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();

  const [exam, schoolClass] = await Promise.all([
    api.exams.get(examId).catch((err) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }),
    getClassById(classId),
  ]);

  if (!exam) notFound();
  if (!schoolClass) notFound();

  // Authorize: must be a class teacher for this class
  const isClassTeacher = schoolClass.classTeachers.some((t) => t.staffId === user.linkedId);
  if (!isClassTeacher) {
    return (
      <div className="space-y-4">
        <Link
          href="/teacher/class-reports"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} className="mr-1" /> Back
        </Link>
        <p className="text-sm text-muted-foreground">
          You are not assigned as a class teacher for this class.
        </p>
      </div>
    );
  }

  const [rosterRes, classReport, completeness] = await Promise.all([
    api.classes.enrollments(classId, { status: "Active", size: 200 }),
    api.classReports.get(examId, classId).catch((err) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }),
    api.classReports.scoreCompleteness(examId, classId),
  ]);

  const roster = rosterRes.items
    .slice()
    .sort((a, b) => (a.studentLastName ?? "").localeCompare(b.studentLastName ?? ""));

  const aggregates = new Map<string, number | null>();
  await Promise.all(
    roster.map(async (s) => {
      const card = await api.studentViews.reportCard(s.studentId, examId);
      aggregates.set(s.studentId, card.aggregate ?? null);
    })
  );

  const remarksById = new Map(
    (classReport?.remarks ?? []).map((r) => [r.studentId, r.text ?? ""])
  );

  const submission: ClassReportSubmission | null = classReport
    ? {
        id: classReport.id ?? "",
        examId: classReport.examId,
        classId: classReport.classId,
        status: classReport.status,
        submittedById: classReport.submittedById ?? null,
        submittedAt: classReport.submittedAt ?? null,
      }
    : null;

  const initialRows = roster.map((s) => ({
    studentId: s.studentId,
    studentName: `${s.studentFirstName ?? ""} ${s.studentLastName ?? ""}`.trim(),
    aggregate: aggregates.get(s.studentId) ?? null,
    classTeacherRemark: remarksById.get(s.studentId) ?? "",
  }));

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/class-reports"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to class reports
      </Link>
      <ScoreCompletenessPanel rows={completeness.subjects} rosterCount={completeness.rosterCount} />
      <ClassReportSubmitForm
        exam={{ ...exam, publishedAt: exam.publishedAt ?? null, createdAt: exam.createdAt ?? "" }}
        classId={classId}
        className={schoolClass.name}
        submittedById={user.linkedId}
        submission={submission}
        initialRows={initialRows}
      />
    </div>
  );
}
