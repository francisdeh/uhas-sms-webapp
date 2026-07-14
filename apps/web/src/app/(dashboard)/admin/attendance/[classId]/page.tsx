import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { AttendanceSheet } from "@/features/attendance/components/AttendanceSheet";
import { MALE, type Student } from "@/features/students/types";
import {
  ATTENDANCE_STATUS,
  type AttendanceStatus,
  type SessionWithRecords,
} from "@/features/attendance/types";
import type { Division } from "@/features/auth/types";

const API_TO_UI_STATUS: Record<
  "Present" | "Absent" | "Late" | "Excused",
  AttendanceStatus
> = {
  Present: ATTENDANCE_STATUS.PRESENT,
  Absent: ATTENDANCE_STATUS.ABSENT,
  Late: ATTENDANCE_STATUS.LATE,
  Excused: ATTENDANCE_STATUS.EXCUSED,
};

export default async function AdminAttendanceClassPage({
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

  const api = await getApi();
  let schoolClass;
  try {
    schoolClass = await api.classes.get(classId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const rosterResp = await api.classes.enrollments(classId, {
    status: "Active",
    size: 200,
  });
  const students: Student[] = rosterResp.items
    .filter((e) => e.studentIsActive ?? true)
    .map((e) => ({
      id: e.studentId,
      slug: e.studentSlug ?? e.studentId,
      schoolId: schoolClass.schoolId,
      firstName: e.studentFirstName ?? "",
      lastName: e.studentLastName ?? "",
      dob: "",
      gender: (e.studentGender as Student["gender"]) ?? MALE,
      classId: e.classId,
      className: e.className ?? schoolClass.name,
      division: (e.division as Division) ?? schoolClass.division,
      photoUrl: e.studentPhotoUrl ?? undefined,
      isActive: e.studentIsActive ?? true,
      createdAt: new Date().toISOString(),
    }));

  let existingSession: SessionWithRecords | null = null;
  try {
    const sess = await api.attendance.lookupSession({ classId, date });
    existingSession = {
      id: sess.id,
      schoolId: sess.schoolId,
      classId: sess.classId,
      date: sess.date,
      term: sess.term,
      submittedById: sess.submittedById ?? "",
      submittedAt: sess.submittedAt ?? new Date().toISOString(),
      records: sess.records.map((r) => ({
        sessionId: sess.id,
        studentId: r.studentId,
        status: API_TO_UI_STATUS[r.status],
        lateReason: r.lateReason ?? undefined,
        note: r.note ?? undefined,
      })),
    };
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/attendance"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ChevronLeft size={14} /> Back to picker
        </Link>
      </div>
      <AttendanceSheet
        classId={classId}
        className={schoolClass.name}
        date={date}
        term={1}
        students={students}
        existingSession={existingSession}
        editable={true}
        submittedById={user.linkedId}
      />
    </div>
  );
}
