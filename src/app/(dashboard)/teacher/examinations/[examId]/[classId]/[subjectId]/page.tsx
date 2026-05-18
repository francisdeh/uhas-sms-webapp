import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import {
  getExamAction,
  getScoresForGridAction,
} from "@/features/exams/actions";
import { listClassesAction, listClassSubjectsAction } from "@/features/classes/actions";
import { ScoreEntryGrid } from "@/features/exams/components/ScoreEntryGrid";

interface PageProps {
  params: Promise<{ examId: string; classId: string; subjectId: string }>;
}

export default async function ScoreEntryPage({ params }: PageProps) {
  const { examId, classId, subjectId } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const [exam, classes, classSubjects] = await Promise.all([
    getExamAction(examId),
    listClassesAction(),
    listClassSubjectsAction(classId),
  ]);

  if (!exam) notFound();

  const schoolClass = classes.find((c) => c.id === classId);
  if (!schoolClass) notFound();

  const assignment = classSubjects.find(
    (cs) => cs.subjectId === subjectId && cs.teacherId === user.linkedId
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

  const { rows } = await getScoresForGridAction({ examId, subjectId, classId });

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
      />
    </div>
  );
}
