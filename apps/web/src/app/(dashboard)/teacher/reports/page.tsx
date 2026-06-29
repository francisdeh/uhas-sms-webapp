import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listTeacherAssignmentsAction } from "@/features/exams/actions";
import { listClassTeacherClassesAction } from "@/features/exams/actions";
import { getClassStats } from "@/features/reports/queries/get-stats";
import { TeacherReports } from "@/features/reports/components/TeacherReports";

export default async function TeacherReportsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  // Classes the teacher teaches a subject in, plus classes they class-teach
  const [subjectAssignments, classTeacherClasses] = await Promise.all([
    listTeacherAssignmentsAction(user.linkedId),
    listClassTeacherClassesAction(user.linkedId),
  ]);

  const classIds = new Set<string>([
    ...subjectAssignments.map((c) => c.classId),
    ...classTeacherClasses.map((c) => c.classId),
  ]);

  const classes = (
    await Promise.all([...classIds].map((id) => getClassStats(id)))
  ).filter((c): c is NonNullable<typeof c> => !!c);

  return <TeacherReports classes={classes} />;
}
