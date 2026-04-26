import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listClassesAction } from "@/features/classes/actions";
import { listStudentsAction } from "@/features/students/actions";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import ClassesTable from "@/features/classes/components/ClassesTable";

export default async function DeputyHeadClassesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);

  const [classes, students] = await Promise.all([
    listClassesAction(division),
    listStudentsAction(division),
  ]);

  const studentCounts: Record<string, number> = {};
  students.forEach((s) => {
    studentCounts[s.classId] = (studentCounts[s.classId] ?? 0) + 1;
  });

  return (
    <ClassesTable
      initialClasses={classes}
      studentCounts={studentCounts}
      listHref="/deputy-head/classes"
      readonly
    />
  );
}
