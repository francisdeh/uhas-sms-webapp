import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList, ChevronRight, Lock, Check } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TeacherClassReportsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const [examsPage, allClassesPage] = await Promise.all([
    api.exams.list({ size: 100 }),
    api.classes.list({ size: 500 }),
  ]);

  // Find classes where the user is a class teacher (GAP: no direct API).
  const perClass = await Promise.all(
    allClassesPage.items.map(async (c) => ({
      class: c,
      teachers: (await api.classes.teachers.list(c.id)).items,
    })),
  );
  const classes = perClass
    .filter((entry) => entry.teachers.some((t) => t.staffId === user.linkedId))
    .map((entry) => ({
      classId: entry.class.id,
      className: entry.class.name,
    }));

  const exams = examsPage.items;

  if (classes.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold">Class Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5 mb-6">
          Submit class-teacher remarks per student for each exam to Head of School.
        </p>
        <Card>
          <CardContent className="py-10 text-center">
            <ClipboardList className="mx-auto mb-3 text-muted-foreground" size={28} />
            <p className="text-sm text-muted-foreground">
              You are not assigned as a class teacher for any class.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // For each exam, fetch its class-report list (server-scoped to caller).
  const matrix = await Promise.all(
    exams.map(async (exam) => {
      const submissionsPage = await api.classReports.list(exam.id);
      const submissionByClass = new Map(
        submissionsPage.items.map((s) => [s.classId, s]),
      );
      return {
        exam,
        classes: classes.map((cls) => ({
          ...cls,
          submission: submissionByClass.get(cls.classId) ?? null,
        })),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Class Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Submit class-teacher remarks per student. Head of School reviews submitted reports before publishing to parents.
        </p>
      </div>

      {exams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No exams configured for the current academic year yet.
          </CardContent>
        </Card>
      ) : (
        matrix.map(({ exam, classes }) => (
          <Card key={exam.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">{exam.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Term {exam.term} · {exam.academicYear}
                </p>
              </div>
              {exam.isPublished && (
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                  <Lock size={11} className="mr-1" /> Published
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {classes.map((cls) => (
                <Link
                  key={`${exam.id}-${cls.classId}`}
                  href={`/teacher/class-reports/${exam.id}/${cls.classId}`}
                  className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{cls.className}</p>
                    {cls.submission?.status === "submitted" ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
                        <Check size={10} className="mr-1" /> Submitted
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                    )}
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  />
                </Link>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
