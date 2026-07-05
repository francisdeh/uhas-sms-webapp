import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { ReportCardPage } from "@/features/exams/components/ReportCardPage";
import { computeAggregate } from "@/features/exams/utils";
import type { ReportCardData } from "@/features/exams/types";
import type { Student } from "@/features/students/types";
import type { Exam } from "@/features/exams/types";
import type { Division } from "@/features/auth/types";

interface PageProps {
  params: Promise<{ id: string; examId: string }>;
}

export default async function AdminReportCardRoute({ params }: PageProps) {
  const { id, examId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  let card;
  let examRead;
  try {
    [card, examRead] = await Promise.all([
      api.studentViews.reportCard(id, examId),
      api.exams.get(examId),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // GAP: ReportCardResponse's ReportCardScoreRow doesn't carry a
  // Core/Elective flag — everything is bucketed into coreRows here.
  // The FE report card renders both buckets identically, so the print
  // layout still holds. Track and fix once the API exposes category.
  const rows = card.scores.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    category: "Core" as const,
    cat1: s.cat1 ?? null,
    cat2: s.cat2 ?? null,
    projectWork: s.projectWork ?? null,
    groupWork: s.groupWork ?? null,
    examScore: s.examScore ?? null,
    totalScore: s.totalScore ?? null,
    grade: s.grade ?? null,
    interpretation: s.interpretation ?? null,
    subjectPosition: s.subjectPosition ?? null,
  }));

  const student: Student = {
    id: card.student.id,
    slug: card.student.slug,
    schoolId: examRead.schoolId,
    firstName: card.student.firstName,
    middleName: card.student.middleName ?? undefined,
    lastName: card.student.lastName,
    dob: "",
    gender: (card.student.gender as "Male" | "Female") ?? "Male",
    classId: "",
    className: card.student.className,
    division: card.student.division as Division,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

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

  const data: ReportCardData = {
    exam,
    student,
    className: card.student.className,
    numberOnRoll: 0,
    coreRows: rows,
    electiveRows: [],
    aggregate: card.aggregate ?? computeAggregate(rows),
    attendance: { attended: 0, total: 0 },
    classTeacherNames: card.classTeachers,
    classTeacherRemark: card.classTeacherRemark ?? null,
    headOfSchoolComment: card.headOfSchoolComment ?? null,
  };

  return (
    <ReportCardPage
      data={data}
      backHref={`/admin/students/${id}`}
      studentId={id}
      examId={examId}
      unpublishedNotice={!exam.isPublished}
    />
  );
}
