import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listClassesAction } from "@/features/classes/actions";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import ClassCreateForm from "@/features/classes/components/ClassCreateForm";

export default async function AdminClassesNewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [classes, currentYear] = await Promise.all([
    listClassesAction(),
    getCurrentAcademicYear(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <ClassCreateForm
        existingClasses={classes}
        listHref="/admin/classes"
        currentYear={currentYear}
      />
    </div>
  );
}
