import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Check } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ examId: string }>;
}

export default async function AdminReviewListPage({ params }: PageProps) {
  const { examId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  let exam;
  try {
    exam = await api.exams.get(examId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [classesResp, submissionsResp] = await Promise.all([
    api.classes.list({ academicYear: exam.academicYear, size: 200 }),
    api.classReports.list(examId),
  ]);

  const classes = classesResp.items;
  const submissionByClass = new Map(
    submissionsResp.items.map((s) => [s.classId, s] as const),
  );

  return (
    <div className="space-y-5">
      <Link
        href="/admin/examinations"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to examinations
      </Link>

      <div>
        <h1 className="text-xl font-bold">Review — {exam.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Review class reports submitted by class teachers and add Head of School comments per student.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Classes</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1">
          {classes.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No classes configured.</p>
          )}
          {classes.map((cls) => {
            const sub = submissionByClass.get(cls.id);
            return (
              <Link
                key={cls.id}
                href={`/admin/examinations/${examId}/review/${cls.id}`}
                className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-sm font-medium">{cls.name}</p>
                  <Badge variant="secondary" className="text-[10px]">{cls.division}</Badge>
                  {sub?.status === "submitted" ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
                      <Check size={10} className="mr-1" /> Submitted
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Not submitted</Badge>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
