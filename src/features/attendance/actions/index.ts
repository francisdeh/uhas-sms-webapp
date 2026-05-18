"use server";

import { mockAttendanceSessions, mockAttendanceRecords } from "@/lib/mock/attendance";
import { mockStaffSessions, mockStaffAttendanceRecords } from "@/lib/mock/staff-attendance";
import { mockLeaveRequests } from "@/lib/mock/leave-requests";
import { mockStaff } from "@/lib/mock/staff";
import type {
  AttendanceStatus,
  AttendanceRecord,
  AttendanceSession,
  SessionWithRecords,
  StaffAttendanceStatus,
  StaffAttendanceRecord,
  StaffAttendanceSession,
  StaffSessionWithRecords,
  LeaveRequest,
  CreateLeaveRequestInput,
} from "@/features/attendance/types";

let sessions: AttendanceSession[] = [...mockAttendanceSessions];
let records: AttendanceRecord[] = [...mockAttendanceRecords];

let staffSessions: StaffAttendanceSession[] = [...mockStaffSessions];
let staffRecords: StaffAttendanceRecord[] = [...mockStaffAttendanceRecords];
let leaveRequests: LeaveRequest[] = [...mockLeaveRequests];

type ActionResult = { success: true } | { success: false; error: string };

export async function getSessionForClassDateAction(
  classId: string,
  date: string
): Promise<SessionWithRecords | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;

  const session = sessions.find((s) => s.classId === classId && s.date === date);
  if (!session) return null;

  const sessionRecords = records.filter((r) => r.sessionId === session.id);
  return { ...session, records: sessionRecords };
}

export async function saveSessionAction(input: {
  classId: string;
  date: string;
  term: number;
  submittedById: string;
  records: { studentId: string; status: AttendanceStatus; lateReason?: string; note?: string }[];
}): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {

  const missingLateReason = input.records.find((r) => r.status === "late" && !r.lateReason?.trim());
  if (missingLateReason) {
    return { success: false, error: "Late students must have a reason." };
  }
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "Mock data is not enabled" };
  }

  const sessionId = `session-${input.classId}-${input.date}`;

  const existingIndex = sessions.findIndex((s) => s.id === sessionId);
  if (existingIndex !== -1) {
    sessions[existingIndex] = {
      ...sessions[existingIndex],
      term: input.term,
      submittedById: input.submittedById,
      submittedAt: new Date().toISOString(),
    };
    records = records.filter((r) => r.sessionId !== sessionId);
  } else {
    const newSession: AttendanceSession = {
      id: sessionId,
      schoolId: "school-uhas-001",
      classId: input.classId,
      date: input.date,
      term: input.term,
      submittedById: input.submittedById,
      submittedAt: new Date().toISOString(),
    };
    sessions.push(newSession);
  }

  const newRecords: AttendanceRecord[] = input.records.map((r) => ({
    sessionId,
    studentId: r.studentId,
    status: r.status,
    lateReason: r.status === "late" ? r.lateReason : undefined,
    note: r.note,
  }));
  records.push(...newRecords);

  return { success: true, sessionId };
}

export async function listSessionsForClassAction(classId: string): Promise<AttendanceSession[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];

  return sessions
    .filter((s) => s.classId === classId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getStudentAttendanceSummaryAction(
  studentId: string
): Promise<{ total: number; present: number; absent: number; late: number; pct: number }> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { total: 0, present: 0, absent: 0, late: 0, pct: 0 };
  }

  const studentRecords = records.filter((r) => r.studentId === studentId);

  const total = studentRecords.length;
  const present = studentRecords.filter((r) => r.status === "present").length;
  const absent = studentRecords.filter((r) => r.status === "absent").length;
  const late = studentRecords.filter((r) => r.status === "late").length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;

  return { total, present, absent, late, pct };
}

export async function listAllSessionsAction(filter?: {
  classId?: string;
  from?: string;
  to?: string;
}): Promise<AttendanceSession[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];

  let filtered = [...sessions];

  if (filter?.classId) {
    filtered = filtered.filter((s) => s.classId === filter.classId);
  }

  if (filter?.from) {
    filtered = filtered.filter((s) => s.date >= filter.from!);
  }

  if (filter?.to) {
    filtered = filtered.filter((s) => s.date <= filter.to!);
  }

  return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function getStaffSessionForDivisionDateAction(
  division: "KG" | "Lower Primary" | "Upper Primary" | "JHS",
  date: string
): Promise<StaffSessionWithRecords | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  const session = staffSessions.find(
    (s) => s.division === division && s.date === date
  );
  if (!session) return null;
  return {
    ...session,
    records: staffRecords.filter((r) => r.sessionId === session.id),
  };
}

export async function saveStaffSessionAction(input: {
  division: "KG" | "Lower Primary" | "Upper Primary" | "JHS";
  date: string;
  term: number;
  submittedById: string;
  records: { staffId: string; status: StaffAttendanceStatus; note?: string }[];
}): Promise<{ success: true; sessionId: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true")
    return { success: false, error: "Mock data not enabled" };

  const sessionId = `staff-session-${input.division}-${input.date}`;
  const existing = staffSessions.find((s) => s.id === sessionId);

  if (existing) {
    staffSessions = staffSessions.map((s) =>
      s.id === sessionId ? { ...s, submittedById: input.submittedById, submittedAt: new Date().toISOString() } : s
    );
    staffRecords = staffRecords.filter((r) => r.sessionId !== sessionId);
  } else {
    staffSessions.push({
      id: sessionId,
      schoolId: "school-uhas-001",
      division: input.division,
      date: input.date,
      term: input.term,
      submittedById: input.submittedById,
      submittedAt: new Date().toISOString(),
    });
  }

  staffRecords.push(
    ...input.records.map((r) => ({ sessionId, staffId: r.staffId, status: r.status, note: r.note }))
  );

  return { success: true, sessionId };
}

export async function listLeaveRequestsAction(filter?: {
  staffId?: string;
  division?: "KG" | "Lower Primary" | "Upper Primary" | "JHS";
  status?: "pending" | "approved" | "rejected";
}): Promise<LeaveRequest[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];

  let result = [...leaveRequests];

  if (filter?.staffId) {
    result = result.filter((r) => r.staffId === filter.staffId);
  }

  if (filter?.division) {
    const divisionStaffIds = new Set(
      mockStaff
        .filter((s) => s.division === filter.division)
        .map((s) => s.id)
    );
    result = result.filter((r) => divisionStaffIds.has(r.staffId));
  }

  if (filter?.status) {
    result = result.filter((r) => r.status === filter.status);
  }

  return result.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function submitLeaveRequestAction(
  staffId: string,
  staffName: string,
  input: CreateLeaveRequestInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true")
    return { success: false, error: "Mock data not enabled" };

  if (input.endDate < input.startDate)
    return { success: false, error: "End date must be on or after start date" };

  const hasOverlap = leaveRequests.some(
    (r) =>
      r.staffId === staffId &&
      (r.status === "pending" || r.status === "approved") &&
      r.startDate <= input.endDate &&
      r.endDate >= input.startDate
  );
  if (hasOverlap)
    return { success: false, error: "You already have an overlapping leave request for those dates" };

  const id = `leave-${Date.now()}`;
  leaveRequests.push({
    id,
    schoolId: "school-uhas-001",
    staffId,
    staffName,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  return { success: true, id };
}

export async function approveLeaveRequestAction(
  id: string,
  approvedById: string,
  approvedByName: string
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true")
    return { success: false, error: "Mock data not enabled" };

  const request = leaveRequests.find((r) => r.id === id);
  if (!request) return { success: false, error: "Leave request not found" };
  if (request.status !== "pending")
    return { success: false, error: "Only pending requests can be approved" };

  leaveRequests = leaveRequests.map((r) =>
    r.id === id
      ? { ...r, status: "approved", approvedById, approvedByName }
      : r
  );

  return { success: true };
}

export async function rejectLeaveRequestAction(
  id: string,
  rejectedById: string,
  rejectionReason?: string
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true")
    return { success: false, error: "Mock data not enabled" };

  const request = leaveRequests.find((r) => r.id === id);
  if (!request) return { success: false, error: "Leave request not found" };
  if (request.status !== "pending")
    return { success: false, error: "Only pending requests can be rejected" };

  leaveRequests = leaveRequests.map((r) =>
    r.id === id
      ? { ...r, status: "rejected", rejectionReason }
      : r
  );

  return { success: true };
}

export async function getStudentAttendanceCalendarAction(
  studentId: string,
  classId: string
): Promise<{ date: string; status: AttendanceStatus }[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];

  const classSessions = sessions.filter((s) => s.classId === classId);
  const result: { date: string; status: AttendanceStatus }[] = [];

  for (const session of classSessions) {
    const record = records.find(
      (r) => r.sessionId === session.id && r.studentId === studentId
    );
    if (record) result.push({ date: session.date, status: record.status });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}
