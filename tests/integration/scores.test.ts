import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb } from "../db";
import { signInAs, signOut } from "../setup";
import {
  saveScoresAction,
  publishExamAction,
  unpublishExamAction,
  getScoresForGridAction,
  createExamAction,
} from "@/features/exams/actions";
import { db } from "@/db";
import { exams, scores, auditLog } from "@/db/schema";

beforeAll(async () => {
  await resetDb();
});

beforeEach(() => {
  signOut();
  signInAs("Admin");
});

// JHS 1 + Mathematics + the published Mid-Term 1 exam (seeded).
const EXAM_ID = "exam-midterm-t1-2026";
const SUBJECT_ID = "sub-jhs-002"; // Mathematics
const CLASS_ID = "class-jhs1";

describe("saveScoresAction (MidTerm)", () => {
  beforeEach(async () => {
    // The seed publishes exam-midterm-t1-2026 — unpublish so we can edit.
    await unpublishExamAction(EXAM_ID);
  });

  it("creates score rows + computes total/grade/interpretation", async () => {
    const result = await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [
        { studentId: "UHAS-2026-0001", examScore: 85 },
        { studentId: "UHAS-2026-0002", examScore: 70 },
      ],
    });
    expect(result.success).toBe(true);

    const sc1 = await db.query.scores.findFirst({
      where: and(
        eq(scores.examId, EXAM_ID),
        eq(scores.subjectId, SUBJECT_ID),
        eq(scores.studentId, "UHAS-2026-0001")
      ),
    });
    expect(sc1?.totalScore).toBe(85);
    expect(sc1?.grade).toBe("2");
    expect(sc1?.interpretation).toBe("Higher");
  });

  it("reranks subjectPosition across the class", async () => {
    await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [
        { studentId: "UHAS-2026-0001", examScore: 50 },
        { studentId: "UHAS-2026-0002", examScore: 80 },
      ],
    });

    const sc1 = await db.query.scores.findFirst({
      where: and(
        eq(scores.examId, EXAM_ID),
        eq(scores.subjectId, SUBJECT_ID),
        eq(scores.studentId, "UHAS-2026-0001")
      ),
    });
    const sc2 = await db.query.scores.findFirst({
      where: and(
        eq(scores.examId, EXAM_ID),
        eq(scores.subjectId, SUBJECT_ID),
        eq(scores.studentId, "UHAS-2026-0002")
      ),
    });
    expect(sc2?.subjectPosition).toBe(1);
    expect(sc1?.subjectPosition).toBe(2);
  });

  it("returns error when exam is published", async () => {
    await publishExamAction(EXAM_ID);
    const result = await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [{ studentId: "UHAS-2026-0001", examScore: 50 }],
    });
    expect(result.success).toBe(false);
  });

  it("writes SCORE_OVERRIDE audit log when re-editing an existing scored row", async () => {
    // First save creates the row (no audit log because before-totalScore is null)
    await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [{ studentId: "UHAS-2026-0001", examScore: 55 }],
    });

    const beforeAudits = await db.query.auditLog.findMany({
      where: eq(auditLog.action, "SCORE_OVERRIDE"),
    });

    // Second save edits the existing row → should write audit log
    await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [{ studentId: "UHAS-2026-0001", examScore: 90 }],
    });

    const afterAudits = await db.query.auditLog.findMany({
      where: eq(auditLog.action, "SCORE_OVERRIDE"),
    });
    expect(afterAudits.length).toBe(beforeAudits.length + 1);
  });

  it("deletes the score row when all components are cleared", async () => {
    await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [{ studentId: "UHAS-2026-0001", examScore: 60 }],
    });
    await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [{ studentId: "UHAS-2026-0001", examScore: null }],
    });
    const row = await db.query.scores.findFirst({
      where: and(
        eq(scores.examId, EXAM_ID),
        eq(scores.subjectId, SUBJECT_ID),
        eq(scores.studentId, "UHAS-2026-0001")
      ),
    });
    expect(row).toBeUndefined();
  });

  it("rejects out-of-range component values", async () => {
    const result = await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [{ studentId: "UHAS-2026-0001", examScore: 150 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("publish / unpublish", () => {
  it("publish + unpublish toggles isPublished and publishedAt", async () => {
    // Use a unique slot — Mid-Term term 2 exists in seed (unpublished), so use term 3.
    const result = await createExamAction({
      name: "Test Exam",
      type: "MidTerm",
      term: 3,
      academicYear: "2025/2026",
    });
    if (!result.success) throw new Error(`create failed: ${result.error}`);
    const examId = result.id;

    await publishExamAction(examId);
    let row = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
    expect(row?.isPublished).toBe(true);
    expect(row?.publishedAt).not.toBeNull();

    await unpublishExamAction(examId);
    row = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
    expect(row?.isPublished).toBe(false);
    expect(row?.publishedAt).toBeNull();
  });

  it("publish on already-published returns error", async () => {
    await publishExamAction(EXAM_ID); // already published by seed
    const result = await publishExamAction(EXAM_ID);
    expect(result.success).toBe(false);
  });
});

describe("getScoresForGridAction", () => {
  it("returns roster + matching scores for the (exam, subject, class)", async () => {
    await unpublishExamAction(EXAM_ID);
    await saveScoresAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
      rows: [{ studentId: "UHAS-2026-0001", examScore: 75 }],
    });

    const grid = await getScoresForGridAction({
      examId: EXAM_ID,
      subjectId: SUBJECT_ID,
      classId: CLASS_ID,
    });
    expect(grid.exam?.id).toBe(EXAM_ID);
    expect(grid.rows.length).toBeGreaterThan(0);
    const adwoa = grid.rows.find((r) => r.studentId === "UHAS-2026-0001");
    expect(adwoa?.score?.totalScore).toBe(75);
  });
});
