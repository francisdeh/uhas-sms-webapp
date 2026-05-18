import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import {
  getExamAction,
  getClassReportSubmissionAction,
  listRemarksForExamClassAction,
} from "@/features/exams/actions";
import { listClassesAction } from "@/features/classes/actions";
import { mockStudents } from "@/lib/mock/students";
import { mockScores } from "@/lib/mock/scores";
import { computeAggregate } from "@/features/exams/utils";
import { HeadOfSchoolReviewForm } from "@/features/exams/components/HeadOfSchoolReviewForm";

interface PageProps {
  params: Promise<{ examId: string; classId: string }>;
}

export default async function AdminReviewClassPage({ params }: PageProps) {
  const { examId, classId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [exam, classes, submission, remarks] = await Promise.all([
    getExamAction(examId),
    listClassesAction(),
    getClassReportSubmissionAction(examId, classId),
    listRemarksForExamClassAction(examId, classId),
  ]);

  if (!exam) notFound();
  const schoolClass = classes.find((c) => c.id === classId);
  if (!schoolClass) notFound();

  const roster = mockStudents
    .filter((s) => s.classId === classId && s.isActive)
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  const initialRows = roster.map((s) => {
    const remark = remarks.find((r) => r.studentId === s.id);
    const scores = mockScores.filter((sc) => sc.examId === examId && sc.studentId === s.id);
    return {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      aggregate: computeAggregate(scores),
      classTeacherRemark: remark?.classTeacherRemark ?? "",
      headOfSchoolComment: remark?.headOfSchoolComment ?? "",
    };
  });

  return (
    <div className="space-y-4">
      <Link
        href={`/admin/examinations/${examId}/review`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to classes
      </Link>
      <HeadOfSchoolReviewForm
        exam={exam}
        className={schoolClass.name}
        submission={submission}
        initialRows={initialRows}
      />
    </div>
  );
}
