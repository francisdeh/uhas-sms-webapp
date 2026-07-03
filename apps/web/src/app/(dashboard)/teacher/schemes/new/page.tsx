import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getApi } from "@/lib/api/server";
import { SchemeForm } from "@/features/schemes/components/SchemeForm";

export default async function NewSchemePage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const [{ rows }, currentAcademicYear] = await Promise.all([
    api.classSubjects.listByTeacher(user.linkedId),
    getCurrentAcademicYear(),
  ]);
  const flat = rows.map((r) => ({
    classId: r.classId,
    className: r.className,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
  }));

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/schemes"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to schemes
      </Link>
      <SchemeForm
        teacherId={user.linkedId}
        existing={null}
        assignments={flat}
        backHref="/teacher/schemes"
        currentAcademicYear={currentAcademicYear}
      />
    </div>
  );
}
