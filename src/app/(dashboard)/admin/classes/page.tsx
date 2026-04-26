import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listClassesAction } from "@/features/classes/actions";
import { listStudentsAction } from "@/features/students/actions";
import ClassesTable from "@/features/classes/components/ClassesTable";

export default async function AdminClassesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [classes, students] = await Promise.all([
    listClassesAction(),
    listStudentsAction(),
  ]);

  const studentCounts: Record<string, number> = {};
  students.forEach((s) => {
    studentCounts[s.classId] = (studentCounts[s.classId] ?? 0) + 1;
  });

  return (
    <ClassesTable
      initialClasses={classes}
      studentCounts={studentCounts}
      listHref="/admin/classes"
    />
  );
}
