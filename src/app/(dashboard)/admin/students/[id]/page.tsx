import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { mockStudents } from "@/lib/mock/students";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const student = mockStudents.find((s) => s.id === id);
  if (!student) notFound();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {student.firstName} {student.lastName}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{student.id}</p>
        </div>
        <Link
          href="/admin/students"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Students
        </Link>
      </div>
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          Full student profile coming in Phase 2b.
        </CardContent>
      </Card>
    </div>
  );
}
