import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { AttendanceSheet } from "@/features/attendance/components/AttendanceSheet";
import { SessionHistory } from "@/features/attendance/components/SessionHistory";
import type {
  AttendanceSession,
  SessionWithRecords,
} from "@/features/attendance/types";
import type { Student } from "@/features/students/types";

export default async function TeacherAttendanceClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { classId } = await params;
  const { date: dateParam } = await searchParams;

  const today = new Date().toISOString().split("T")[0];
  const date = dateParam ?? today;
  const editable = date === today;

  const api = await getApi();
  let schoolClass;
  try {
    schoolClass = await api.classes.get(classId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [rosterPage, existingSession, allSessionsPage] = await Promise.all([
    api.classes.enrollments(classId, { status: "Active", size: 500 }),
    api.attendance
      .lookupSession({ classId, date })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
    api.attendance.listSessions({ classId, size: 200 }),
  ]);

  const students: Student[] = rosterPage.items.map((e) => ({
    id: e.studentId,
    slug: e.studentSlug ?? e.studentId,
    schoolId: "",
    firstName: e.studentFirstName ?? "",
    lastName: e.studentLastName ?? "",
    dob: "",
    gender: (e.studentGender ?? "Male") as "Male" | "Female",
    classId: e.classId,
    className: e.className ?? "",
    division: (e.division ?? "KG") as Student["division"],
    photoUrl: e.studentPhotoUrl ?? undefined,
    isActive: e.studentIsActive ?? true,
    createdAt: new Date().toISOString(),
  }));

  return (
    <div className="space-y-6">
      <AttendanceSheet
        classId={classId}
        className={schoolClass.name}
        date={date}
        term={1}
        students={students}
        existingSession={existingSession as unknown as SessionWithRecords | null}
        editable={editable}
        submittedById={user.linkedId}
      />
      <SessionHistory
        sessions={allSessionsPage.items as unknown as AttendanceSession[]}
        basePath={`/teacher/attendance/${classId}`}
      />
    </div>
  );
}
