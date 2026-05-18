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
import { ClassReportSubmitForm } from "@/features/exams/components/ClassReportSubmitForm";

interface PageProps {
  params: Promise<{ examId: string; classId: string }>;
}

export default async function ClassReportSubmitPage({ params }: PageProps) {
  const { examId, classId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const [exam, classes, submission, remarks] = await Promise.all([
    getExamAction(examId),
    listClassesAction(),
    getClassReportSubmissionAction(examId, classId),
    listRemarksForExamClassAction(examId, classId),
  ]);

  if (!exam) notFound();

  const schoolClass = classes.find((c) => c.id === classId);
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
    };
  });

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/class-reports"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to class reports
      </Link>
      <ClassReportSubmitForm
        exam={exam}
        classId={classId}
        className={schoolClass.name}
        submittedById={user.linkedId}
        submission={submission}
        initialRows={initialRows}
      />
    </div>
  );
}
