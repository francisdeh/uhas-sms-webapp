import type {
  StaffAttendanceSession,
  StaffAttendanceRecord,
} from "@/features/attendance/types";

export const mockStaffSessions: StaffAttendanceSession[] = [
  {
    id: "staff-session-JHS-2026-04-24",
    schoolId: "school-uhas-001",
    division: "JHS",
    date: "2026-04-24",
    term: 1,
    submittedById: "STAFF-002",
    submittedAt: "2026-04-24T09:00:00Z",
  },
  {
    id: "staff-session-JHS-2026-04-25",
    schoolId: "school-uhas-001",
    division: "JHS",
    date: "2026-04-25",
    term: 1,
    submittedById: "STAFF-002",
    submittedAt: "2026-04-25T09:00:00Z",
  },
  {
    id: "staff-session-Primary-2026-04-25",
    schoolId: "school-uhas-001",
    division: "Primary",
    date: "2026-04-25",
    term: 1,
    submittedById: "STAFF-003",
    submittedAt: "2026-04-25T09:05:00Z",
  },
];

export const mockStaffAttendanceRecords: StaffAttendanceRecord[] = [
  // staff-session-JHS-2026-04-24
  {
    sessionId: "staff-session-JHS-2026-04-24",
    staffId: "STAFF-002",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-24",
    staffId: "STAFF-004",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-24",
    staffId: "STAFF-005",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-24",
    staffId: "STAFF-008",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-24",
    staffId: "STAFF-009",
    status: "absent",
  },
  {
    sessionId: "staff-session-JHS-2026-04-24",
    staffId: "STAFF-011",
    status: "on_leave",
  },
  // staff-session-JHS-2026-04-25
  {
    sessionId: "staff-session-JHS-2026-04-25",
    staffId: "STAFF-002",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-25",
    staffId: "STAFF-004",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-25",
    staffId: "STAFF-005",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-25",
    staffId: "STAFF-008",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-25",
    staffId: "STAFF-009",
    status: "present",
  },
  {
    sessionId: "staff-session-JHS-2026-04-25",
    staffId: "STAFF-011",
    status: "present",
  },
  // staff-session-Primary-2026-04-25
  {
    sessionId: "staff-session-Primary-2026-04-25",
    staffId: "STAFF-003",
    status: "present",
  },
  {
    sessionId: "staff-session-Primary-2026-04-25",
    staffId: "STAFF-006",
    status: "present",
  },
  {
    sessionId: "staff-session-Primary-2026-04-25",
    staffId: "STAFF-010",
    status: "absent",
  },
];
