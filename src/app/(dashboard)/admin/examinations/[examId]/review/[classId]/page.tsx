import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { db } from "@/db";
import { enrollments, scores, students as studentsTable } from "@/db/schema";
import {
  getExamAction,
  getClassReportSubmissionAction,
  listRemarksForExamClassAction,
} from "@/features/exams/actions";
import { listClassesAction } from "@/features/classes/actions";
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

  const roster = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
    })
    .from(enrollments)
    .innerJoin(studentsTable, eq(studentsTable.id, enrollments.studentId))
    .where(
      and(
        eq(enrollments.classId, classId),
        eq(enrollments.academicYear, exam.academicYear),
        eq(enrollments.status, "Active"),
        eq(studentsTable.isActive, true)
      )
    )
    .orderBy(asc(studentsTable.lastName));
  const studentIds = roster.map((s) => s.id);

  const scoreRows = studentIds.length === 0
    ? []
    : await db.query.scores.findMany({
        where: and(eq(scores.examId, examId), inArray(scores.studentId, studentIds)),
      });
  const scoresByStudent = new Map<string, typeof scoreRows>();
  for (const sc of scoreRows) {
    const list = scoresByStudent.get(sc.studentId) ?? [];
    list.push(sc);
    scoresByStudent.set(sc.studentId, list);
  }

  const initialRows = roster.map((s) => {
    const remark = remarks.find((r) => r.studentId === s.id);
    const studentScores = scoresByStudent.get(s.id) ?? [];
    return {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      aggregate: computeAggregate(studentScores),
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
