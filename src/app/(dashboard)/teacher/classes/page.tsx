import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import {
  listClassesAction,
  listClassSubjectsByTeacherAction,
} from "@/features/classes/actions";
import { listStudentsAction } from "@/features/students/actions";
import { TeacherClassesView } from "@/features/classes/components/TeacherClassesView";

export default async function TeacherClassesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const teacherId = user.linkedId;

  const [allClasses, subjectAssignments, allStudents] = await Promise.all([
    listClassesAction(),
    listClassSubjectsByTeacherAction(teacherId),
    listStudentsAction(),
  ]);

  const classTeacherClassIds = new Set(
    allClasses.filter((c) => c.classTeacherId === teacherId).map((c) => c.id)
  );

  const subjectClassIds = new Set(subjectAssignments.map((cs) => cs.classId));

  const involvedClassIds = new Set([...classTeacherClassIds, ...subjectClassIds]);

  const subjectsByClass = new Map<string, typeof subjectAssignments>();
  for (const cs of subjectAssignments) {
    const list = subjectsByClass.get(cs.classId) ?? [];
    list.push(cs);
    subjectsByClass.set(cs.classId, list);
  }

  const studentCountByClass: Record<string, number> = {};
  for (const s of allStudents) {
    if (s.isActive) {
      studentCountByClass[s.classId] = (studentCountByClass[s.classId] ?? 0) + 1;
    }
  }

  const entries = allClasses
    .filter((c) => involvedClassIds.has(c.id))
    .map((schoolClass) => ({
      schoolClass,
      isClassTeacher: classTeacherClassIds.has(schoolClass.id),
      subjectsTaught: subjectsByClass.get(schoolClass.id) ?? [],
      studentCount: studentCountByClass[schoolClass.id] ?? 0,
    }));

  return <TeacherClassesView entries={entries} />;
}
