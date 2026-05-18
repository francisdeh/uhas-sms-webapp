import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, ChevronRight, Lock, Users } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockStudents } from "@/lib/mock/students";
import { listExamsAction } from "@/features/exams/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ParentResultsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const childIds = mockStudentGuardians[user.linkedId] ?? [];
  const children = childIds
    .map((id) => mockStudents.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const publishedExams = await listExamsAction({ isPublished: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Results</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          View and print published report cards for your child(ren).
        </p>
      </div>

      {children.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No children linked to your account"
          description="Ask the school office to link your child(ren) to your guardian profile."
        />
      ) : publishedExams.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No published results yet"
          description="Report cards become available once an exam is published. Check back after the term ends."
        />
      ) : (
        children.map((child) => (
          <Card key={child.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {child.firstName} {child.middleName ? `${child.middleName} ` : ""}
                {child.lastName}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {child.className} · {child.division}
              </p>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {publishedExams.map((exam) => (
                <Link
                  key={exam.id}
                  href={`/parent/results/${child.id}/${exam.id}`}
                  className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <p className="text-sm font-medium">{exam.name}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      Term {exam.term} · {exam.academicYear}
                    </Badge>
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
                      <Lock size={10} className="mr-1" /> Published
                    </Badge>
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
