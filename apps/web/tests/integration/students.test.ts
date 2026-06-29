import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb } from "../db";
import { signInAs, signOut } from "../setup";
import {
  createStudentAction,
  deactivateStudentAction,
  reactivateStudentAction,
  updateStudentAction,
  transferStudentAction,
  listStudentsAction,
} from "@/features/students/actions";
import { db } from "@/db";
import { students, enrollments, auditLog } from "@/db/schema";

beforeAll(async () => {
  await resetDb();
});

beforeEach(() => {
  signOut();
  signInAs("Admin");
});

describe("createStudentAction", () => {
  it("generates next sequence ID and inserts student + active enrollment in a tx", async () => {
    const result = await createStudentAction({
      firstName: "Test",
      lastName: "Newkid",
      dob: "2015-05-15",
      gender: "Male",
      classId: "class-p3",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.id).toMatch(/^UHAS-\d{4}-\d{4}$/);
    const studentRow = await db.query.students.findFirst({
      where: eq(students.id, result.id),
    });
    expect(studentRow?.firstName).toBe("Test");
    expect(studentRow?.isActive).toBe(true);

    const enr = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.studentId, result.id),
        eq(enrollments.status, "Active")
      ),
    });
    expect(enr?.classId).toBe("class-p3");
  });

  it("rejects unknown classId", async () => {
    const result = await createStudentAction({
      firstName: "T",
      lastName: "N",
      dob: "2015-05-15",
      gender: "Male",
      classId: "class-does-not-exist",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateStudentAction", () => {
  it("updates fields and writes a STUDENT_EDIT audit log", async () => {
    const before = await db.query.auditLog.findMany({
      where: eq(auditLog.action, "STUDENT_EDIT"),
    });
    const beforeCount = before.length;

    const result = await updateStudentAction("UHAS-2026-0001", {
      phone: "0244999000",
      nationality: "Ghanaian",
    });
    expect(result.success).toBe(true);

    const after = await db.query.students.findFirst({
      where: eq(students.id, "UHAS-2026-0001"),
    });
    expect(after?.phone).toBe("0244999000");
    expect(after?.nationality).toBe("Ghanaian");

    const audits = await db.query.auditLog.findMany({
      where: eq(auditLog.action, "STUDENT_EDIT"),
    });
    expect(audits.length).toBe(beforeCount + 1);
    const last = audits[audits.length - 1];
    expect(last.targetTable).toBe("students");
    expect(last.targetId).toBe("UHAS-2026-0001");
  });

  it("returns error when student not found", async () => {
    const result = await updateStudentAction("UHAS-0000-9999", { phone: "x" });
    expect(result.success).toBe(false);
  });
});

describe("deactivate / reactivate", () => {
  it("flips isActive", async () => {
    await deactivateStudentAction("UHAS-2026-0002");
    let row = await db.query.students.findFirst({
      where: eq(students.id, "UHAS-2026-0002"),
    });
    expect(row?.isActive).toBe(false);

    await reactivateStudentAction("UHAS-2026-0002");
    row = await db.query.students.findFirst({
      where: eq(students.id, "UHAS-2026-0002"),
    });
    expect(row?.isActive).toBe(true);
  });

  it("returns error for unknown id", async () => {
    const result = await deactivateStudentAction("UHAS-0000-0001");
    expect(result.success).toBe(false);
  });
});

describe("transferStudentAction", () => {
  it("closes old enrollment and opens a new one in a tx", async () => {
    // Move UHAS-2026-0003 (JHS 2) to JHS 1
    const before = await db.query.enrollments.findMany({
      where: eq(enrollments.studentId, "UHAS-2026-0003"),
    });
    const activeBefore = before.find((e) => e.status === "Active");
    expect(activeBefore?.classId).toBe("class-jhs2");

    const result = await transferStudentAction("UHAS-2026-0003", {
      classId: "class-jhs1",
    });
    expect(result.success).toBe(true);

    const after = await db.query.enrollments.findMany({
      where: eq(enrollments.studentId, "UHAS-2026-0003"),
    });
    const activeAfter = after.find((e) => e.status === "Active");
    const completedAfter = after.filter((e) => e.status === "Completed");
    expect(activeAfter?.classId).toBe("class-jhs1");
    expect(completedAfter.length).toBeGreaterThanOrEqual(1);
    expect(completedAfter.find((e) => e.classId === "class-jhs2")).toBeDefined();
  });

  it("rejects transfer to the same class", async () => {
    const result = await transferStudentAction("UHAS-2026-0004", {
      classId: "class-jhs2", // already in this class
    });
    expect(result.success).toBe(false);
  });
});

describe("listStudentsAction", () => {
  it("filters by division when given", async () => {
    const jhsOnly = await listStudentsAction("JHS");
    expect(jhsOnly.length).toBeGreaterThan(0);
    expect(jhsOnly.every((s) => s.division === "JHS")).toBe(true);
  });

  it("returns all students when no filter", async () => {
    const all = await listStudentsAction();
    const divisions = new Set(all.map((s) => s.division));
    expect(divisions.size).toBeGreaterThan(1);
  });
});
