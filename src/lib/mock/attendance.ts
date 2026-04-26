export type MockAttendanceRecord = {
  studentId: string;
  status: "present" | "absent" | "late";
  note?: string;
};

export type MockAttendanceSession = {
  id: string;
  classId: string;
  date: string;
  term: number;
  submittedById: string;
  records: MockAttendanceRecord[];
};

export const mockAttendanceSessions: MockAttendanceSession[] = [
  {
    id: "session-001",
    classId: "class-jhs1a",
    date: "2026-04-25",
    term: 1,
    submittedById: "STAFF-005",
    records: [
      { studentId: "UHAS-2026-0001", status: "present" },
      { studentId: "UHAS-2026-0002", status: "absent", note: "Sick" },
    ],
  },
  {
    id: "session-002",
    classId: "class-jhs2a",
    date: "2026-04-25",
    term: 1,
    submittedById: "STAFF-005",
    records: [
      { studentId: "UHAS-2026-0003", status: "present" },
      { studentId: "UHAS-2026-0004", status: "late", note: "Arrived 8:30am" },
    ],
  },
];
