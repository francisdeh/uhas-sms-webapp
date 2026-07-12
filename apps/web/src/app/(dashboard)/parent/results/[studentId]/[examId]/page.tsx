import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { ReportCardPage } from "@/features/exams/components/ReportCardPage";
import { computeAggregate } from "@/features/exams/utils";
import type { ReportCardData, Exam } from "@/features/exams/types";
import type { Student } from "@/features/students/types";
import type { Division } from "@/features/auth/types";

interface PageProps {
  params: Promise<{ studentId: string; examId: string }>;
}

export default async function ParentReportCardRoute({ params }: PageProps) {
  const { studentId, examId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  let card;
  try {
    card = await api.studentViews.reportCard(studentId, examId);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      notFound();
    }
    throw err;
  }

  if (!card.exam.isPublished) notFound();

  // GAP: ReportCardResponse's ReportCardScoreRow doesn't carry a
  // Core/Elective flag — everything is bucketed into coreRows here.
  // The FE report card renders both buckets identically, so the print
  // layout still holds. Matches the admin report-card route's approach.
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
    classAverage: s.classAverage ?? null,
  }));

  const student: Student = {
    id: card.student.id,
    slug: card.student.slug,
    schoolId: card.school.id,
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

  // The student-view endpoint doesn't surface publishedAt/createdAt —
  // not rendered anywhere on the parent-facing report card, so
  // placeholders are fine (same approximation the admin route makes
  // for fields its own source response doesn't carry).
  const exam: Exam = {
    id: card.exam.id,
    schoolId: card.school.id,
    name: card.exam.name,
    type: card.exam.type,
    term: card.exam.term,
    academicYear: card.exam.academicYear,
    isPublished: card.exam.isPublished,
    publishedAt: null,
    createdAt: new Date().toISOString(),
  };

  const data: ReportCardData = {
    exam,
    student,
    className: card.student.className,
    numberOnRoll: 0,
    coreRows: rows,
    electiveRows: [],
    gradingBands: card.gradingBands,
    aggregate: card.aggregate ?? computeAggregate(rows),
    attendance: { attended: 0, total: 0 },
    classTeacherNames: card.classTeachers,
    classTeacherRemark: card.classTeacherRemark ?? null,
    headOfSchoolComment: card.headOfSchoolComment ?? null,
    kgObservations: card.kgObservations ?? null,
    conductRatings: card.conductRatings ?? null,
    interestsCoCurricular: card.interestsCoCurricular ?? null,
    vacationDate: card.vacationDate ?? null,
    reopeningDate: card.reopeningDate ?? null,
  };

  return (
    <ReportCardPage
      data={data}
      backHref="/parent/results"
      studentId={studentId}
      examId={examId}
    />
  );
}
