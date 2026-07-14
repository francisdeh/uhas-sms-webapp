import type { Division } from "@/features/auth/types";

export type AttendanceStatus = "present" | "absent" | "late";

// "At school" sets for two endpoints with genuinely different wire
// casings — `get_student_calendar` (parent dashboard) translates DB
// status to lowercase via `_DB_STATUS_TO_WIRE`, while the staff
// attendance session endpoint returns the raw capitalized DB value.
// Mirrors the backend's `reports/repository.py` `_ATTENDANCE_AT_SCHOOL`.
export const STUDENT_CALENDAR_AT_SCHOOL_STATUSES: readonly string[] = ["present", "late"];
export const STAFF_SESSION_AT_SCHOOL_STATUSES: readonly string[] = ["Present", "Late"];

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

// Mirrors app/features/leave_requests/constants.py LeaveType. Was
// previously a stale, incorrect 4-value lowercase union that nothing
// actually used (LeaveRequestForm hand-rolled its own correct Zod
// enum instead) — fixed alongside the leave-management-depth work.
export const LEAVE_TYPES = [
  "Casual",
  "Sick",
  "Maternity",
  "Paternity",
  "Study",
  "Compassionate",
  "Other",
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequest = {
  id: string;
  schoolId: string;
  staffId: string;
  staffName: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: LeaveRequestStatus;
  approvedById: string | null;
  approvedByName: string | null;
  rejectionReason: string | null;
  substituteStaffId: string | null;
  substituteStaffName: string | null;
  documentUrls: string[];
  createdAt: string | null;
};

export type CreateLeaveRequestInput = {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
  documentUrls?: string[];
};

// GET /leave-requests/balance/{staffId} — Casual leave only.
export type LeaveBalance = {
  staffId: string;
  entitlementDays: number;
  usedDays: number;
  remainingDays: number;
};

export const LATE_THRESHOLD_HHMM = "08:00";

export function isLateArrival(timeHHMM: string): boolean {
  return timeHHMM >= LATE_THRESHOLD_HHMM;
}
