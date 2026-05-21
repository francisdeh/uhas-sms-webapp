import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../db";
import { signInAs, signOut } from "../setup";
import {
  saveSessionAction,
  getSessionForClassDateAction,
  saveStaffSessionAction,
  submitLeaveRequestAction,
  approveLeaveRequestAction,
  rejectLeaveRequestAction,
  listLeaveRequestsAction,
} from "@/features/attendance/actions";
import { db } from "@/db";
import {
  attendanceRecords,
  attendanceSessions,
  leaveRequests,
  staffAttendanceRecords,
} from "@/db/schema";

beforeAll(async () => {
  await resetDb();
});

beforeEach(() => {
  signOut();
  signInAs("Teacher");
});

const CLASS_ID = "class-jhs1";
const DATE = "2026-09-01"; // fresh date with no seeded session

describe("saveSessionAction (student attendance)", () => {
  it("creates session + records on first save", async () => {
    const result = await saveSessionAction({
      classId: CLASS_ID,
      date: DATE,
      term: 1,
      submittedById: "STAFF-005",
      records: [
        { studentId: "UHAS-2026-0001", status: "present" },
        { studentId: "UHAS-2026-0002", status: "absent", note: "Sick" },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const session = await db.query.attendanceSessions.findFirst({
      where: eq(attendanceSessions.id, result.sessionId),
    });
    expect(session?.classId).toBe(CLASS_ID);

    const records = await db.query.attendanceRecords.findMany({
      where: eq(attendanceRecords.sessionId, result.sessionId),
    });
    expect(records.length).toBe(2);
    const absent = records.find((r) => r.studentId === "UHAS-2026-0002");
    expect(absent?.status).toBe("absent");
    expect(absent?.note).toBe("Sick");
  });

  it("upserts on second save for same (class, date)", async () => {
    // First save
    await saveSessionAction({
      classId: CLASS_ID,
      date: DATE,
      term: 1,
      submittedById: "STAFF-005",
      records: [{ studentId: "UHAS-2026-0001", status: "absent" }],
    });
    // Re-save with different status
    const result = await saveSessionAction({
      classId: CLASS_ID,
      date: DATE,
      term: 1,
      submittedById: "STAFF-005",
      records: [{ studentId: "UHAS-2026-0001", status: "present" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const records = await db.query.attendanceRecords.findMany({
      where: eq(attendanceRecords.sessionId, result.sessionId),
    });
    expect(records.length).toBe(1);
    expect(records[0].status).toBe("present");
  });

  it("rejects late status without a reason", async () => {
    const result = await saveSessionAction({
      classId: CLASS_ID,
      date: DATE,
      term: 1,
      submittedById: "STAFF-005",
      records: [
        { studentId: "UHAS-2026-0001", status: "late", lateReason: "" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("getSessionForClassDateAction returns saved session", async () => {
    await saveSessionAction({
      classId: CLASS_ID,
      date: DATE,
      term: 1,
      submittedById: "STAFF-005",
      records: [{ studentId: "UHAS-2026-0001", status: "late", lateReason: "Bus" }],
    });
    const session = await getSessionForClassDateAction(CLASS_ID, DATE);
    expect(session).not.toBeNull();
    expect(session?.records).toHaveLength(1);
    expect(session?.records[0].lateReason).toBe("Bus");
  });
});

describe("saveStaffSessionAction", () => {
  it("creates session + records", async () => {
    signInAs("DeputyHead");
    const result = await saveStaffSessionAction({
      division: "JHS",
      date: DATE,
      term: 1,
      submittedById: "STAFF-002",
      records: [
        { staffId: "STAFF-005", status: "present" },
        { staffId: "STAFF-008", status: "absent" },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const records = await db.query.staffAttendanceRecords.findMany({
      where: eq(staffAttendanceRecords.sessionId, result.sessionId),
    });
    expect(records.length).toBe(2);
  });
});

describe("leave requests", () => {
  beforeEach(async () => {
    await db.delete(leaveRequests);
  });

  it("submit creates a pending request", async () => {
    const result = await submitLeaveRequestAction("STAFF-005", "Selorm Tornu", {
      type: "sick",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      reason: "Flu",
    });
    expect(result.success).toBe(true);

    const all = await db.query.leaveRequests.findMany({});
    expect(all.length).toBe(1);
    expect(all[0].status).toBe("pending");
  });

  it("rejects when end date is before start date", async () => {
    const result = await submitLeaveRequestAction("STAFF-005", "Kwame", {
      type: "sick",
      startDate: "2026-09-10",
      endDate: "2026-09-05",
    });
    expect(result.success).toBe(false);
  });

  it("rejects overlapping pending/approved requests", async () => {
    await submitLeaveRequestAction("STAFF-005", "Kwame", {
      type: "sick",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
    });
    const result = await submitLeaveRequestAction("STAFF-005", "Kwame", {
      type: "sick",
      startDate: "2026-09-11", // overlaps
      endDate: "2026-09-12",
    });
    expect(result.success).toBe(false);
  });

  it("approveLeaveRequestAction flips pending → approved", async () => {
    const submit = await submitLeaveRequestAction("STAFF-005", "Kwame", {
      type: "sick",
      startDate: "2026-09-15",
      endDate: "2026-09-16",
    });
    if (!submit.success) throw new Error("submit failed");

    const result = await approveLeaveRequestAction(submit.id, "STAFF-002", "Abena");
    expect(result.success).toBe(true);

    const row = await db.query.leaveRequests.findFirst({
      where: eq(leaveRequests.id, submit.id),
    });
    expect(row?.status).toBe("approved");
    expect(row?.approvedById).toBe("STAFF-002");
  });

  it("rejectLeaveRequestAction flips pending → rejected", async () => {
    const submit = await submitLeaveRequestAction("STAFF-005", "Kwame", {
      type: "personal",
      startDate: "2026-09-20",
      endDate: "2026-09-20",
    });
    if (!submit.success) throw new Error("submit failed");

    const result = await rejectLeaveRequestAction(submit.id, "STAFF-002", "Not enough notice");
    expect(result.success).toBe(true);

    const row = await db.query.leaveRequests.findFirst({
      where: eq(leaveRequests.id, submit.id),
    });
    expect(row?.status).toBe("rejected");
  });

  it("listLeaveRequestsAction filters by status", async () => {
    const submit1 = await submitLeaveRequestAction("STAFF-005", "Kwame", {
      type: "sick",
      startDate: "2026-10-01",
      endDate: "2026-10-01",
    });
    if (!submit1.success) throw new Error("submit failed");
    await approveLeaveRequestAction(submit1.id, "STAFF-002", "Abena");

    await submitLeaveRequestAction("STAFF-005", "Kwame", {
      type: "sick",
      startDate: "2026-10-10",
      endDate: "2026-10-10",
    });

    const pendingOnly = await listLeaveRequestsAction({ status: "pending" });
    expect(pendingOnly.every((r) => r.status === "pending")).toBe(true);

    const approvedOnly = await listLeaveRequestsAction({ status: "approved" });
    expect(approvedOnly.every((r) => r.status === "approved")).toBe(true);
  });
});

