import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import {
  getExamAction,
  getClassReportSubmissionAction,
  listRemarksForExamClassAction,
} from "@/features/exams/actions";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { enrollments, scores, students as studentsTable } from "@/db/schema";
import { listClassesAction } from "@/features/classes/actions";
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
