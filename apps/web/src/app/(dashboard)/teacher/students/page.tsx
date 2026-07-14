import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { TeacherStudentsTable } from "@/features/students/components/TeacherStudentsTable";
import { MALE, type Student } from "@/features/students/types";
import { KG } from "@/features/auth/types";

export default async function TeacherStudentsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const teacherId = user.linkedId;
  const api = await getApi();

  const [subjectRowsResp, classTeacherClassesPage] = await Promise.all([
    api.classSubjects.listByTeacher(teacherId),
    api.classes.list({ classTeacherId: teacherId, size: 500 }),
  ]);

  const classIds = new Set<string>([
    ...subjectRowsResp.rows.map((r) => r.classId),
    ...classTeacherClassesPage.items.map((c) => c.id),
  ]);

  const rosterPages = await Promise.all(
    [...classIds].map((classId) =>
      api.classes.enrollments(classId, { status: "Active", size: 500 })
    )
  );

  const seen = new Set<string>();
  const students: Student[] = [];
  for (const rosterPage of rosterPages) {
    for (const e of rosterPage.items) {
      if (seen.has(e.studentId)) continue;
      seen.add(e.studentId);
      students.push({
        id: e.studentId,
        slug: e.studentSlug ?? e.studentId,
        schoolId: "",
        firstName: e.studentFirstName ?? "",
        lastName: e.studentLastName ?? "",
        dob: "",
        gender: (e.studentGender ?? MALE) as Student["gender"],
        classId: e.classId,
        className: e.className ?? "",
        division: (e.division ?? KG) as Student["division"],
        photoUrl: e.studentPhotoUrl ?? undefined,
        isActive: e.studentIsActive ?? true,
        createdAt: new Date().toISOString(),
      });
    }
  }
  students.sort((a, b) => a.lastName.localeCompare(b.lastName));

  return <TeacherStudentsTable students={students} listHref="/teacher/students" />;
}
