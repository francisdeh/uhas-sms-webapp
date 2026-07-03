import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { TeacherClassList } from "@/features/attendance/components/TeacherClassList";
import type { SchoolClass } from "@/features/classes/types";

export default async function TeacherAttendancePage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  // GAP: no `listClassTeacherClassesAction` API. Fallback: derive "involved
  // classes" from the teacher's subject-assignments, then re-check who's a
  // class teacher via `classes.teachers.list`. Behavior stays: only classes
  // where the caller appears in `class_teachers` render in the list.
  const [subjectRowsResp, allClassesPage, todaySessionsPage] = await Promise.all([
    api.classSubjects.listByTeacher(user.linkedId),
    api.classes.list({ size: 500 }),
    api.attendance.listSessions({ size: 500 }),
  ]);

  const today = new Date().toISOString().split("T")[0];

  const candidateClassIds = new Set(subjectRowsResp.rows.map((r) => r.classId));
  const candidateClasses = allClassesPage.items.filter((c) =>
    candidateClassIds.has(c.id),
  );

  // Per-class teacher lookups — only the small candidate set gets queried.
  const teachersPerClass = await Promise.all(
    candidateClasses.map(async (c) => ({
      class: c,
      teachers: (await api.classes.teachers.list(c.id)).items,
    })),
  );

  const myClasses: SchoolClass[] = teachersPerClass
    .filter((entry) => entry.teachers.some((t) => t.staffId === user.linkedId))
    .map(({ class: c, teachers }) => ({
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
    }));

  const todaySessions = todaySessionsPage.items.filter((s) => s.date === today);
  const todaySessionMap: Record<string, boolean> = {};
  for (const cls of myClasses) {
    todaySessionMap[cls.id] = todaySessions.some((s) => s.classId === cls.id);
  }

  return (
    <TeacherClassList
      classes={myClasses}
      todaySessions={todaySessionMap}
      listHref="/teacher/attendance"
    />
  );
}
