"use server";
import type { ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  attendanceSessions,
  attendanceRecords,
  staffAttendanceSessions,
  staffAttendanceRecords,
  leaveRequests,
  staff,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { formatDate } from "@/lib/dates";
import { notifyAudience } from "@/features/notifications/lib/create-notification";
import type {
  AttendanceStatus,
  AttendanceSession,
  SessionWithRecords,
  StaffAttendanceStatus,
  StaffAttendanceSession,
  StaffSessionWithRecords,
  LeaveRequest,
  CreateLeaveRequestInput,
} from "@/features/attendance/types";
import type { Division } from "@/features/auth/types";


function toSession(row: typeof attendanceSessions.$inferSelect): AttendanceSession {
  return {
    id: row.id,
    schoolId: row.schoolId,
    classId: row.classId,
    date: row.date,
    term: row.term,
    submittedById: row.submittedById ?? "",
    submittedAt: row.submittedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toStaffSession(row: typeof staffAttendanceSessions.$inferSelect): StaffAttendanceSession {
  return {
    id: row.id,
    schoolId: row.schoolId,
    division: row.division as Division,
    date: row.date,
    term: row.term,
    submittedById: row.submittedById ?? "",
    submittedAt: row.submittedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function getSessionForClassDateAction(
  classId: string,
  date: string
): Promise<SessionWithRecords | null> {
  const session = await db.query.attendanceSessions.findFirst({
    where: and(eq(attendanceSessions.classId, classId), eq(attendanceSessions.date, date)),
  });
  if (!session) return null;
  const records = await db.query.attendanceRecords.findMany({
    where: eq(attendanceRecords.sessionId, session.id),
  });
  return {
    ...toSession(session),
    records: records.map((r) => ({
      sessionId: r.sessionId,
      studentId: r.studentId,
      status: r.status as AttendanceStatus,
      lateReason: r.lateReason ?? undefined,
      note: r.note ?? undefined,
    })),
  };
}

export async function saveSessionAction(input: {
  classId: string;
  date: string;
  term: number;
  submittedById: string;
  records: { studentId: string; status: AttendanceStatus; lateReason?: string; note?: string }[];
}): Promise<ActionResult<{ sessionId: string }>> {
  const missingLateReason = input.records.find(
    (r) => r.status === "late" && !r.lateReason?.trim()
  );
  if (missingLateReason) {
    return { success: false, error: "Late students must have a reason." };
  }

  const schoolId = await getCurrentSchoolId();
  const sessionId = `session-${input.classId}-${input.date}`;

  await db.transaction(async (tx) => {
    const existing = await tx.query.attendanceSessions.findFirst({
      where: eq(attendanceSessions.id, sessionId),
    });
    if (existing) {
      await tx
        .update(attendanceSessions)
        .set({ term: input.term, submittedById: input.submittedById, submittedAt: new Date() })
        .where(eq(attendanceSessions.id, sessionId));
      await tx
        .delete(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, sessionId));
    } else {
      await tx.insert(attendanceSessions).values({
        id: sessionId,
        schoolId,
        classId: input.classId,
        date: input.date,
        term: input.term,
        submittedById: input.submittedById,
      });
    }

    if (input.records.length > 0) {
      await tx.insert(attendanceRecords).values(
        input.records.map((r) => ({
          sessionId,
          studentId: r.studentId,
          status: r.status,
          lateReason: r.status === "late" ? r.lateReason ?? null : null,
          note: r.note ?? null,
        }))
      );
    }
  });

  // Notify parents of students marked absent. "Late" doesn't notify — that
  // would create noise for routine tardiness. Only "absent" qualifies. Notif
  // is per parent, but the body mentions only the single child (parents of
  // multiple students each get N notifications, one per absent child).
  const absentStudentIds = input.records
    .filter((r) => r.status === "absent")
    .map((r) => r.studentId);
  if (absentStudentIds.length > 0) {
    const dateLabel = formatDate(input.date, "EEEE, d MMM");
    for (const studentId of absentStudentIds) {
      await notifyAudience(
        { type: "parentsOfStudents", studentIds: [studentId] },
        {
          kind: "attendance_absent",
          title: "Absence recorded",
          body: `Your child was marked absent on ${dateLabel}.`,
          link: `/parent/attendance`,
        }
      );
    }
  }

  revalidatePath("/teacher/attendance");
  revalidatePath(`/teacher/attendance/${input.classId}`);
  return { success: true, sessionId };
}

export async function listSessionsForClassAction(classId: string): Promise<AttendanceSession[]> {
  const rows = await db.query.attendanceSessions.findMany({
    where: eq(attendanceSessions.classId, classId),
    orderBy: [desc(attendanceSessions.date)],
  });
  return rows.map(toSession);
}

export async function getStudentAttendanceSummaryAction(
  studentId: string
): Promise<{ total: number; present: number; absent: number; late: number; pct: number }> {
  const rows = await db
    .select({ status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.studentId, studentId));

  const total = rows.length;
  const present = rows.filter((r) => r.status === "present").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const late = rows.filter((r) => r.status === "late").length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  return { total, present, absent, late, pct };
}

export async function listAllSessionsAction(filter?: {
  classId?: string;
  from?: string;
  to?: string;
}): Promise<AttendanceSession[]> {
  const rows = await db.query.attendanceSessions.findMany({
    where: and(
      filter?.classId ? eq(attendanceSessions.classId, filter.classId) : undefined,
      filter?.from ? gte(attendanceSessions.date, filter.from) : undefined,
      filter?.to ? lte(attendanceSessions.date, filter.to) : undefined
    ),
    orderBy: [desc(attendanceSessions.date)],
  });
  return rows.map(toSession);
}

export async function getStaffSessionForDivisionDateAction(
  division: Division,
  date: string
): Promise<StaffSessionWithRecords | null> {
  const session = await db.query.staffAttendanceSessions.findFirst({
    where: and(
      eq(staffAttendanceSessions.division, division),
      eq(staffAttendanceSessions.date, date)
    ),
  });
  if (!session) return null;
  const records = await db.query.staffAttendanceRecords.findMany({
    where: eq(staffAttendanceRecords.sessionId, session.id),
  });
  return {
    ...toStaffSession(session),
    records: records.map((r) => ({
      sessionId: r.sessionId,
      staffId: r.staffId,
      status: r.status as StaffAttendanceStatus,
      note: r.note ?? undefined,
    })),
  };
}

export async function saveStaffSessionAction(input: {
  division: Division;
  date: string;
  term: number;
  submittedById: string;
  records: { staffId: string; status: StaffAttendanceStatus; note?: string }[];
}): Promise<ActionResult<{ sessionId: string }>> {
  const schoolId = await getCurrentSchoolId();
  const sessionId = `staff-session-${input.division.replace(/\s+/g, "")}-${input.date}`;

  await db.transaction(async (tx) => {
    const existing = await tx.query.staffAttendanceSessions.findFirst({
      where: eq(staffAttendanceSessions.id, sessionId),
    });
    if (existing) {
      await tx
        .update(staffAttendanceSessions)
        .set({ submittedById: input.submittedById, submittedAt: new Date() })
        .where(eq(staffAttendanceSessions.id, sessionId));
      await tx
        .delete(staffAttendanceRecords)
        .where(eq(staffAttendanceRecords.sessionId, sessionId));
    } else {
      await tx.insert(staffAttendanceSessions).values({
        id: sessionId,
        schoolId,
        division: input.division,
        date: input.date,
        term: input.term,
        submittedById: input.submittedById,
      });
    }
    if (input.records.length > 0) {
      await tx.insert(staffAttendanceRecords).values(
        input.records.map((r) => ({
          sessionId,
          staffId: r.staffId,
          status: r.status,
          note: r.note ?? null,
        }))
      );
    }
  });

  revalidatePath("/deputy-head/attendance");
  return { success: true, sessionId };
}

export async function listLeaveRequestsAction(filter?: {
  staffId?: string;
  division?: Division;
  status?: "pending" | "approved" | "rejected";
}): Promise<LeaveRequest[]> {
  const baseWhere: ReturnType<typeof eq>[] = [];
  if (filter?.staffId) baseWhere.push(eq(leaveRequests.staffId, filter.staffId));
  if (filter?.status) baseWhere.push(eq(leaveRequests.status, filter.status));

  const requesterAlias = staff;
  const approverAlias = staff;

  const rows = await db
    .select({
      id: leaveRequests.id,
      schoolId: leaveRequests.schoolId,
      staffId: leaveRequests.staffId,
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      approvedById: leaveRequests.approvedById,
      createdAt: leaveRequests.createdAt,
      staffFirst: requesterAlias.firstName,
      staffLast: requesterAlias.lastName,
      staffDivision: requesterAlias.division,
    })
    .from(leaveRequests)
    .innerJoin(requesterAlias, eq(requesterAlias.id, leaveRequests.staffId))
    .where(and(...baseWhere));

  // Approver lookup (separate query to avoid a second join on the same table)
  const approverIds = Array.from(
    new Set(rows.map((r) => r.approvedById).filter((id): id is string => !!id))
  );
  const approverMap = new Map<string, string>();
  if (approverIds.length > 0) {
    const approvers = await db
      .select({ id: approverAlias.id, firstName: approverAlias.firstName, lastName: approverAlias.lastName })
      .from(approverAlias)
      .where(inArray(approverAlias.id, approverIds));
    for (const a of approvers) approverMap.set(a.id, `${a.firstName} ${a.lastName}`);
  }

  const list: LeaveRequest[] = rows
    .filter((r) => !filter?.division || r.staffDivision === filter.division)
    .map((r) => ({
      id: r.id,
      schoolId: r.schoolId,
      staffId: r.staffId,
      staffName: `${r.staffFirst} ${r.staffLast}`,
      type: r.type as LeaveRequest["type"],
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason ?? undefined,
      status: r.status as LeaveRequest["status"],
      approvedById: r.approvedById ?? undefined,
      approvedByName: r.approvedById ? approverMap.get(r.approvedById) : undefined,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    }));

  return list.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function submitLeaveRequestAction(
  staffId: string,
  _staffName: string,
  input: CreateLeaveRequestInput
): Promise<ActionResult<{ id: string }>> {
  if (input.endDate < input.startDate) {
    return { success: false, error: "End date must be on or after start date" };
  }

  const schoolId = await getCurrentSchoolId();

  // Overlap check
  const overlap = await db.query.leaveRequests.findFirst({
    where: and(
      eq(leaveRequests.staffId, staffId),
      or(eq(leaveRequests.status, "pending"), eq(leaveRequests.status, "approved")),
      lte(leaveRequests.startDate, input.endDate),
      gte(leaveRequests.endDate, input.startDate)
    ),
  });
  if (overlap) {
    return { success: false, error: "You already have an overlapping leave request for those dates" };
  }

  const id = `leave-${Date.now()}`;
  await db.insert(leaveRequests).values({
    id,
    schoolId,
    staffId,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason ?? null,
    status: "pending",
  });

  // Notify approvers: the requester's DH (by division) + all Admins.
  const requester = await db.query.staff.findFirst({ where: eq(staff.id, staffId) });
  const body = `${_staffName} requested ${input.type} leave from ${input.startDate} to ${input.endDate}.`;
  if (requester?.division) {
    await notifyAudience(
      { type: "staffByDivision", division: requester.division, roles: ["DeputyHead"] },
      {
        kind: "leave_request_submitted",
        title: "Leave request submitted",
        body,
        link: `/deputy-head/leave`,
      }
    );
  }
  await notifyAudience(
    { type: "allAdmins" },
    {
      kind: "leave_request_submitted",
      title: "Leave request submitted",
      body,
      link: `/admin/staff`,
    }
  );

  revalidatePath("/teacher/leave");
  revalidatePath("/deputy-head/leave");
  return { success: true, id };
}

export async function approveLeaveRequestAction(
  id: string,
  approvedById: string,
  _approvedByName: string
): Promise<ActionResult> {
  const row = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, id) });
  if (!row) return { success: false, error: "Leave request not found" };
  if (row.status !== "pending") return { success: false, error: "Only pending requests can be approved" };
  await db
    .update(leaveRequests)
    .set({ status: "approved", approvedById })
    .where(eq(leaveRequests.id, id));

  await notifyAudience(
    { type: "staff", staffId: row.staffId },
    {
      kind: "leave_request_decided",
      title: "Leave request approved",
      body: `Your leave from ${row.startDate} to ${row.endDate} was approved.`,
      link: `/teacher/leave`,
    }
  );

  revalidatePath("/deputy-head/leave");
  return { success: true };
}

export async function rejectLeaveRequestAction(
  id: string,
  _rejectedById: string,
  rejectionReason?: string
): Promise<ActionResult> {
  const row = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, id) });
  if (!row) return { success: false, error: "Leave request not found" };
  if (row.status !== "pending") return { success: false, error: "Only pending requests can be rejected" };
  // NOTE: schema has no `rejectionReason` column; the rejection reason is
  // displayed in the inbox UI but not persisted. Add a column later if needed.
  await db.update(leaveRequests).set({ status: "rejected" }).where(eq(leaveRequests.id, id));

  const reasonNote = rejectionReason?.trim() ? ` Note: ${rejectionReason.trim()}` : "";
  await notifyAudience(
    { type: "staff", staffId: row.staffId },
    {
      kind: "leave_request_decided",
      title: "Leave request rejected",
      body: `Your leave from ${row.startDate} to ${row.endDate} was rejected.${reasonNote}`,
      link: `/teacher/leave`,
    }
  );

  revalidatePath("/deputy-head/leave");
  return { success: true };
}

export async function getStudentAttendanceCalendarAction(
  studentId: string,
  classId: string
): Promise<{ date: string; status: AttendanceStatus }[]> {
  const rows = await db
    .select({ date: attendanceSessions.date, status: attendanceRecords.status })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
    .where(
      and(
        eq(attendanceRecords.studentId, studentId),
        eq(attendanceSessions.classId, classId)
      )
    )
    .orderBy(asc(attendanceSessions.date));

  return rows.map((r) => ({ date: r.date, status: r.status as AttendanceStatus }));
}

