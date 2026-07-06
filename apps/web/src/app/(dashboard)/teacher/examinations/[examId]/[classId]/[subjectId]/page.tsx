import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { ScoreEntryGrid } from "@/features/exams/components/ScoreEntryGrid";
import type { Exam, Score } from "@/features/exams/types";

interface PageProps {
  params: Promise<{ examId: string; classId: string; subjectId: string }>;
}

const EMPTY_SCORE_ID = "00000000-0000-0000-0000-000000000000";

export default async function ScoreEntryPage({ params }: PageProps) {
  const { examId, classId, subjectId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();

  let examRead;
  let schoolClass;
  let school;
  try {
    [examRead, schoolClass, school] = await Promise.all([
      api.exams.get(examId),
      api.classes.get(classId),
      api.school.get(),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
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

  const { rows: assignmentRows } = await api.classSubjects.listByTeacher(user.linkedId);
  const assignment = assignmentRows.find(
    (cs) => cs.subjectId === subjectId && cs.classId === classId
  );
  if (!assignment) {
    return (
      <div className="space-y-4">
        <Link
          href="/teacher/examinations"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} className="mr-1" /> Back to examinations
        </Link>
        <p className="text-sm text-muted-foreground">
          You are not assigned to teach this subject in this class.
        </p>
      </div>
    );
  }

  const scoresGrid = await api.exams.scores.get(examId, { classId, subjectId });
  const rows = scoresGrid.items.map((r) => {
    const hasScore = r.id !== EMPTY_SCORE_ID;
    const score: Score | null = hasScore
      ? {
          id: r.id,
          examId: r.examId,
          studentId: r.studentId,
          subjectId: r.subjectId,
          cat1: r.cat1 ?? null,
          cat2: r.cat2 ?? null,
          projectWork: r.projectWork ?? null,
          groupWork: r.groupWork ?? null,
          examScore: r.examScore ?? null,
          totalScore: r.totalScore ?? null,
          grade: r.grade ?? null,
          interpretation: r.interpretation ?? null,
          subjectPosition: r.subjectPosition ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;
    return {
      studentId: r.studentId,
      studentName: `${r.studentFirstName} ${r.studentLastName}`.trim(),
      score,
    };
  });

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/examinations"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to examinations
      </Link>
      <ScoreEntryGrid
        exam={exam}
        classId={classId}
        className={schoolClass.name}
        subjectId={subjectId}
        subjectName={assignment.subjectName}
        initialRows={rows}
        // GET /school always resolves these to a concrete value (GES
        // defaults or a custom override) — the OpenAPI type is nullable
        // because the underlying column is, not because this endpoint
        // can actually return null for them. See
        // `SchoolsService.get_resolved`.
        gradingBands={school.gradingBands!}
        scoreWeights={school.scoreWeights!}
        passMark={school.passMark}
      />
    </div>
  );
}
