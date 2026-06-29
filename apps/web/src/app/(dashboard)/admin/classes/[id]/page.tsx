import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getClassById } from "@/features/classes/queries/get-class-by-id";
import {
  listClassSubjectsAction,
  listSubjectsAction,
} from "@/features/classes/actions";
import { listStudentsAction } from "@/features/students/actions";
import { listStaffAction } from "@/features/staff/actions";
import ClassDetail from "@/features/classes/components/ClassDetail";

export default async function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const schoolClass = await getClassById(id);
  if (!schoolClass) notFound();

  const [classSubjects, allStudents, allSubjects, allStaff] = await Promise.all([
    listClassSubjectsAction(id),
    listStudentsAction(),
    listSubjectsAction(),
    listStaffAction(),
  ]);

  const roster = allStudents.filter((s) => s.classId === id);
  const linkedSubjectIds = new Set(classSubjects.map((cs) => cs.subjectId));
  const availableSubjects = allSubjects.filter(
    (s) => !linkedSubjectIds.has(s.id)
  );
  const availableTeachers = allStaff.filter((s) => s.isActive);

  return (
    <ClassDetail
      schoolClass={schoolClass}
      classSubjects={classSubjects}
      roster={roster}
      availableSubjects={availableSubjects}
      availableTeachers={availableTeachers}
      allSubjects={allSubjects}
    />
  );
}
