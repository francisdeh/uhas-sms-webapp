import type { Division } from "@/features/auth/types";

export type AttendanceStatus = "present" | "absent" | "late";

export type AttendanceRecord = {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  lateReason?: string;
  note?: string;
};

export type AttendanceSession = {
  id: string;
  schoolId: string;
  classId: string;
  date: string;
  term: number;
  submittedById: string;
  submittedAt: string;
};

export type SessionWithRecords = AttendanceSession & {
  records: AttendanceRecord[];
};

export type StaffAttendanceStatus = "present" | "absent" | "on_leave";

export type StaffAttendanceRecord = {
  sessionId: string;
  staffId: string;
  status: StaffAttendanceStatus;
  note?: string;
};

export type StaffAttendanceSession = {
  id: string;
  schoolId: string;
  division: Division;
  date: string;
  term: number;
  submittedById: string;
  submittedAt: string;
};

export type StaffSessionWithRecords = StaffAttendanceSession & {
  records: StaffAttendanceRecord[];
};

export type LeaveType = "sick" | "maternity" | "personal" | "other";

export type LeaveRequest = {
  id: string;
  schoolId: string;
  staffId: string;
  staffName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  approvedById?: string;
  approvedByName?: string;
  rejectionReason?: string;
  createdAt: string;
};

export type CreateLeaveRequestInput = {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
};

export const LATE_THRESHOLD_HHMM = "08:00";

export function isLateArrival(timeHHMM: string): boolean {
  return timeHHMM >= LATE_THRESHOLD_HHMM;
}
