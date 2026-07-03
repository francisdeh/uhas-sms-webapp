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
  const [subjectRowsResp, allClassesPage] = await Promise.all([
    api.classSubjects.listByTeacher(teacherId),
    api.classes.list({ size: 500 }),
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

  // Determine which of those (plus any class-teacher-only assignments) belong.
  // Fetch teacher lists for each candidate class to derive class-teacher-ship
  // and any additional classes where user is only a class teacher.
  const candidateIds = new Set<string>(subjectClassIds);
  // Also probe every class — teacher may class-teach a class without teaching
  // any subject in it. Kept parallel for latency.
  const teacherLookups = await Promise.all(
    allClassesPage.items.map(async (c) => ({
      class: c,
      teachers: (await api.classes.teachers.list(c.id)).items,
    })),
  );

  for (const entry of teacherLookups) {
    if (entry.teachers.some((t) => t.staffId === teacherId)) {
      candidateIds.add(entry.class.id);
    }
  }

  const involvedClasses = teacherLookups.filter((e) => candidateIds.has(e.class.id));

  const entries = involvedClasses.map(({ class: c, teachers }) => {
    const schoolClass: SchoolClass = {
      id: c.id,
      schoolId: c.schoolId,
      name: c.name,
      division: c.division,
      academicYear: c.academicYear,
      classTeachers: teachers.map((t) => ({
        staffId: t.staffId,
        staffName: `${t.staffFirstName} ${t.staffLastName}`.trim(),
        isPrimary: t.isPrimary,
      })),
    };
    return {
      schoolClass,
      isClassTeacher: teachers.some((t) => t.staffId === teacherId),
      subjectsTaught: subjectsByClass.get(c.id) ?? [],
      studentCount: c.studentCount ?? 0,
    };
  });

  return <TeacherClassesView entries={entries} />;
}
