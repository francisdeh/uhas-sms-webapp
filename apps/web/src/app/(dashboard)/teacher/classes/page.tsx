import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { TeacherClassesView } from "@/features/classes/components/TeacherClassesView";
import type { ClassSubject, SchoolClass } from "@/features/classes/types";

export default async function TeacherClassesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const teacherId = user.linkedId;

  const api = await getApi();
  const [subjectRowsResp, allClassesPage, classTeacherClassesPage] = await Promise.all([
    api.classSubjects.listByTeacher(teacherId),
    api.classes.list({ size: 500 }),
    api.classes.list({ classTeacherId: teacherId, size: 500 }),
  ]);

  // Group subject-assignments by classId.
  const subjectsByClass = new Map<string, ClassSubject[]>();
  for (const r of subjectRowsResp.rows) {
    const list = subjectsByClass.get(r.classId) ?? [];
    list.push({
      classId: r.classId,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      teacherId: r.teacherId ?? null,
      teacherName: r.teacherName ?? null,
    });
    subjectsByClass.set(r.classId, list);
  }

  const subjectClassIds = new Set(subjectsByClass.keys());
  const classTeacherClassIds = new Set(classTeacherClassesPage.items.map((c) => c.id));
  const candidateIds = new Set<string>([...subjectClassIds, ...classTeacherClassIds]);
  const involvedClasses = allClassesPage.items.filter((c) => candidateIds.has(c.id));

  const entries = involvedClasses.map((c) => {
    const schoolClass: SchoolClass = {
      id: c.id,
      schoolId: c.schoolId,
      name: c.name,
      division: c.division,
      academicYear: c.academicYear,
      classTeachers: [],
    };
    return {
      schoolClass,
      isClassTeacher: classTeacherClassIds.has(c.id),
      subjectsTaught: subjectsByClass.get(c.id) ?? [],
      studentCount: c.studentCount ?? 0,
    };
  });

  return <TeacherClassesView entries={entries} />;
}
