import { AttendanceSession, AttendanceRecord } from "@/features/attendance/types";

export const mockAttendanceSessions: AttendanceSession[] = [
  {
    id: "session-jhs1a-2026-04-23",
    schoolId: "school-uhas-001",
    classId: "class-jhs1",
    date: "2026-04-23",
    term: 1,
    submittedById: "STAFF-005",
    submittedAt: "2026-04-23T09:30:00Z",
  },
  {
    id: "session-jhs1a-2026-04-24",
    schoolId: "school-uhas-001",
    classId: "class-jhs1",
    date: "2026-04-24",
    term: 1,
    submittedById: "STAFF-005",
    submittedAt: "2026-04-24T09:15:00Z",
  },
  {
    id: "session-jhs1a-2026-04-25",
    schoolId: "school-uhas-001",
    classId: "class-jhs1",
    date: "2026-04-25",
    term: 1,
    submittedById: "STAFF-005",
    submittedAt: "2026-04-25T09:20:00Z",
  },
  {
    id: "session-jhs2a-2026-04-25",
    schoolId: "school-uhas-001",
    classId: "class-jhs2",
    date: "2026-04-25",
    term: 1,
    submittedById: "STAFF-005",
    submittedAt: "2026-04-25T09:25:00Z",
  },
  {
    id: "session-p4-2026-04-25",
    schoolId: "school-uhas-001",
    classId: "class-p4",
    date: "2026-04-25",
    term: 1,
    submittedById: "STAFF-006",
    submittedAt: "2026-04-25T09:10:00Z",
  },
];

export const mockAttendanceRecords: AttendanceRecord[] = [
  // session-jhs1a-2026-04-23
  {
    sessionId: "session-jhs1a-2026-04-23",
    studentId: "UHAS-2026-0001",
    status: "present",
  },
  {
    sessionId: "session-jhs1a-2026-04-23",
    studentId: "UHAS-2026-0002",
    status: "absent",
    note: "Sick",
  },
  // session-jhs1a-2026-04-24
  {
    sessionId: "session-jhs1a-2026-04-24",
    studentId: "UHAS-2026-0001",
    status: "present",
  },
  {
    sessionId: "session-jhs1a-2026-04-24",
    studentId: "UHAS-2026-0002",
    status: "late",
    note: "Arrived late",
  },
  // session-jhs1a-2026-04-25
  {
    sessionId: "session-jhs1a-2026-04-25",
    studentId: "UHAS-2026-0001",
    status: "present",
  },
  {
    sessionId: "session-jhs1a-2026-04-25",
    studentId: "UHAS-2026-0002",
    status: "present",
  },
  // session-jhs2a-2026-04-25
  {
    sessionId: "session-jhs2a-2026-04-25",
    studentId: "UHAS-2026-0003",
    status: "present",
  },
  {
    sessionId: "session-jhs2a-2026-04-25",
    studentId: "UHAS-2026-0004",
    status: "late",
  },
  {
    sessionId: "session-jhs2a-2026-04-25",
    studentId: "UHAS-2026-0008",
    status: "present",
  },
  // session-p4-2026-04-25
  {
    sessionId: "session-p4-2026-04-25",
    studentId: "UHAS-2026-0012",
    status: "present",
  },
  {
    sessionId: "session-p4-2026-04-25",
    studentId: "UHAS-2026-0015",
    status: "absent",
  },
];
