import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, ChevronRight, Lock } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import {
  listExamsAction,
  listTeacherAssignmentsAction,
} from "@/features/exams/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TeacherExaminationsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const [exams, assignments] = await Promise.all([
    listExamsAction(),
    listTeacherAssignmentsAction(user.linkedId),
  ]);

  if (assignments.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold">Examinations</h1>
        <p className="text-sm text-muted-foreground mt-0.5 mb-6">
          Enter scores for your students. Mid-Term uses a raw 100 score; End-of-Term uses CAT1, CAT2, Project Work, Group Work and the final exam.
        </p>
        <Card>
          <CardContent className="py-10 text-center">
            <FileText className="mx-auto mb-3 text-muted-foreground" size={28} />
            <p className="text-sm text-muted-foreground">
              You don&apos;t have any subjects assigned yet. Ask Admin to assign you to a subject.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Examinations</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Enter scores for your students. Mid-Term uses a raw 100 score; End-of-Term uses CAT1, CAT2, Project Work, Group Work and the final exam.
        </p>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No exams configured for the current academic year yet.
          </CardContent>
        </Card>
      ) : (
        exams.map((exam) => (
          <Card key={exam.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">{exam.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Term {exam.term} · {exam.academicYear} ·{" "}
                  {exam.type === "MidTerm" ? "Mid-Term (raw 100)" : "End of Term (composite)"}
                </p>
              </div>
              {exam.isPublished ? (
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                  <Lock size={11} className="mr-1" /> Published
                </Badge>
              ) : (
                <Badge variant="secondary">Open for entry</Badge>
              )}
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {assignments.flatMap((cls) =>
                cls.subjects.map((subj) => (
                  <Link
                    key={`${exam.id}-${cls.classId}-${subj.subjectId}`}
                    href={`/teacher/examinations/${exam.id}/${cls.classId}/${subj.subjectId}`}
                    className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {cls.className} <span className="text-muted-foreground">·</span> {subj.subjectName}
                      </p>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
