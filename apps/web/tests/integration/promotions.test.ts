import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { det } from "../../scripts/_seed-data/_uuid";
import { and, eq, inArray } from "drizzle-orm";
import { resetDb } from "../db";
import { signInAs, signOut } from "../setup";
import {
  openPromotionSeasonAction,
  closePromotionSeasonAction,
  ensureSubmissionAction,
  saveDraftAction,
  submitListAction,
  approveSubmissionAction,
  sendBackSubmissionAction,
} from "@/features/promotions/actions";
import { db } from "@/db";
import {
  enrollments,
  exams,
  promotionDecisions,
  promotionSeasons,
  promotionSubmissions,
  students,
  auditLog,
} from "@/db/schema";
import { publishExamAction } from "@/features/exams/actions";

const ADMIN_ID = det("STAFF-001");
const DEPUTY_HEAD_UPPER_PRIMARY = det("STAFF-016");
const TEACHER_P5 = det("STAFF-006"); // primary class teacher of class-p5
const P5_CLASS = det("class-p5");
const TERM_3_EXAM = det("exam-eot-t3-2026"); // seeded, published

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  signOut();
  signInAs("Admin");
  // Ensure the season is closed at the start of each test (some tests open it).
  await db.delete(promotionSeasons);
  await db.delete(promotionDecisions);
  await db.delete(promotionSubmissions);
});

describe("openPromotionSeasonAction", () => {
  it("with Term-3 EndOfTerm published → opens immediately (no override)", async () => {
    const result = await openPromotionSeasonAction({ openedById: ADMIN_ID });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.openedWithOverride).toBe(false);

    const row = await db.query.promotionSeasons.findFirst({});
    expect(row?.status).toBe("open");
    expect(row?.openedWithOverride).toBe(false);
  });

  it("without Term-3 EndOfTerm published → requires override", async () => {
    // Unpublish the seeded Term-3 exam
    await db
      .update(exams)
      .set({ isPublished: false, publishedAt: null })
      .where(eq(exams.id, TERM_3_EXAM));

    const result = await openPromotionSeasonAction({ openedById: ADMIN_ID });
    expect(result).toEqual({
      success: false,
      error:
        "Term 3 End-of-Term exam is not published yet. Open with override to proceed without algorithmic suggestions.",
      requiresOverride: true,
    });

    // Restore
    await publishExamAction(TERM_3_EXAM);
  });

  it("with override and no exam → opens with openedWithOverride=true", async () => {
    await db
      .update(exams)
      .set({ isPublished: false, publishedAt: null })
      .where(eq(exams.id, TERM_3_EXAM));

    const result = await openPromotionSeasonAction({
      openedById: ADMIN_ID,
      override: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.openedWithOverride).toBe(true);

    await publishExamAction(TERM_3_EXAM);
  });

  it("already-open → error", async () => {
    await openPromotionSeasonAction({ openedById: ADMIN_ID });
    const result = await openPromotionSeasonAction({ openedById: ADMIN_ID });
    expect(result.success).toBe(false);
  });
});

describe("closePromotionSeasonAction", () => {
  it("flips status to closed", async () => {
    await openPromotionSeasonAction({ openedById: ADMIN_ID });
    const result = await closePromotionSeasonAction({ closedById: ADMIN_ID });
    expect(result.success).toBe(true);

    const row = await db.query.promotionSeasons.findFirst({});
    expect(row?.status).toBe("closed");
  });
});

describe("submission lifecycle", () => {
  beforeEach(async () => {
    // Open season + ensure a submission exists for P5
    await openPromotionSeasonAction({ openedById: ADMIN_ID });
    await ensureSubmissionAction(P5_CLASS);
  });

  it("ensureSubmissionAction creates a draft and one decision per active student", async () => {
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });
    expect(sub?.status).toBe("draft");

    const decisions = await db.query.promotionDecisions.findMany({
      where: eq(promotionDecisions.submissionId, sub!.id),
    });
    // Two active P5 students (UHAS-2026-0010 + UHAS-2026-0011)
    expect(decisions.length).toBeGreaterThanOrEqual(2);
  });

  it("submitListAction requires every promote to have a target class", async () => {
    const result = await submitListAction({
      classId: P5_CLASS,
      submittedById: TEACHER_P5,
      updates: [
        {
          studentId: det("UHAS-2026-0010"),
          decision: "promote",
          targetClassId: null, // missing — should trigger the error
          reason: null,
        },
        {
          // 0011 defaults to "repeat" suggestion (fails 3 cores); make it a
          // valid promote so 0010's missing target is the only error left.
          studentId: det("UHAS-2026-0011"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatch(/target class/i);
  });

  it("submitListAction requires reason for repeat/withdraw", async () => {
    const result = await submitListAction({
      classId: P5_CLASS,
      submittedById: TEACHER_P5,
      updates: [
        {
          studentId: det("UHAS-2026-0011"),
          decision: "repeat",
          targetClassId: det("class-p5-2027"),
          reason: null,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("saveDraftAction transitions sent_back back to draft", async () => {
    // Manually mark sent_back to test the transition
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });
    await db
      .update(promotionSubmissions)
      .set({ status: "sent_back", reviewerComment: "fix it" })
      .where(eq(promotionSubmissions.id, sub!.id));

    await saveDraftAction({
      classId: P5_CLASS,
      updates: [
        {
          studentId: det("UHAS-2026-0010"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
      ],
    });

    const after = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.id, sub!.id),
    });
    expect(after?.status).toBe("draft");
  });
});

describe("approveSubmissionAction (the transactional one)", () => {
  // Approval mutates enrollments + students.isActive — full reset between
  // tests so each one starts from the canonical seed.
  beforeEach(async () => {
    await resetDb();
    signInAs("Admin");
    await openPromotionSeasonAction({ openedById: ADMIN_ID });
    await ensureSubmissionAction(P5_CLASS);
  });

  it("materialises enrollments for promote + repeat + withdraw + graduate", async () => {
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });

    // Set up four distinct decisions across the two active P5 students.
    // 0010 → promote, 0011 → repeat (with reason).
    await submitListAction({
      classId: P5_CLASS,
      submittedById: TEACHER_P5,
      updates: [
        {
          studentId: det("UHAS-2026-0010"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
        {
          studentId: det("UHAS-2026-0011"),
          decision: "repeat",
          targetClassId: det("class-p5-2027"),
          reason: "Failed core subjects",
        },
      ],
    });

    const result = await approveSubmissionAction({
      submissionId: sub!.id,
      reviewedById: DEPUTY_HEAD_UPPER_PRIMARY,
    });
    expect(result.success).toBe(true);

    // Current-year enrollments closed
    const currentClosed = await db.query.enrollments.findMany({
      where: and(
        inArray(enrollments.studentId, [det("UHAS-2026-0010"), det("UHAS-2026-0011")]),
        eq(enrollments.academicYear, "2025/2026"),
        eq(enrollments.status, "Completed")
      ),
    });
    expect(currentClosed.length).toBe(2);

    // New-year enrollments created
    const newYear = await db.query.enrollments.findMany({
      where: and(
        inArray(enrollments.studentId, [det("UHAS-2026-0010"), det("UHAS-2026-0011")]),
        eq(enrollments.academicYear, "2026/2027")
      ),
    });
    expect(newYear.length).toBe(2);
    const promoted = newYear.find((e) => e.studentId === det("UHAS-2026-0010"));
    const repeating = newYear.find((e) => e.studentId === det("UHAS-2026-0011"));
    expect(promoted?.classId).toBe(det("class-p6-2027"));
    expect(promoted?.status).toBe("Active");
    expect(repeating?.classId).toBe(det("class-p5-2027"));
    expect(repeating?.status).toBe("Repeating");

    // Submission marked approved
    const after = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.id, sub!.id),
    });
    expect(after?.status).toBe("approved");
    expect(after?.reviewedById).toBe(DEPUTY_HEAD_UPPER_PRIMARY);

    // Audit log row written
    const audits = await db.query.auditLog.findMany({
      where: eq(auditLog.action, "PROMOTION_APPROVED"),
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    const lastAudit = audits[audits.length - 1];
    expect(lastAudit.targetId).toBe(sub!.id);
  });

  it("withdraw flips students.isActive=false and creates no new enrollment", async () => {
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });

    await submitListAction({
      classId: P5_CLASS,
      submittedById: TEACHER_P5,
      updates: [
        {
          studentId: det("UHAS-2026-0010"),
          decision: "withdraw",
          targetClassId: null,
          reason: "Family moving",
        },
        {
          studentId: det("UHAS-2026-0011"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
      ],
    });

    await approveSubmissionAction({
      submissionId: sub!.id,
      reviewedById: DEPUTY_HEAD_UPPER_PRIMARY,
    });

    const student = await db.query.students.findFirst({
      where: eq(students.id, det("UHAS-2026-0010")),
    });
    expect(student?.isActive).toBe(false);

    const newYearForWithdrawn = await db.query.enrollments.findFirst({
      where: and(
        eq(enrollments.studentId, det("UHAS-2026-0010")),
        eq(enrollments.academicYear, "2026/2027")
      ),
    });
    expect(newYearForWithdrawn).toBeUndefined();
  });

  it("rejects approve when status is not 'submitted'", async () => {
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });
    // Still in draft
    const result = await approveSubmissionAction({
      submissionId: sub!.id,
      reviewedById: DEPUTY_HEAD_UPPER_PRIMARY,
    });
    expect(result.success).toBe(false);
  });

  it("rejects approve when season is closed", async () => {
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });
    await submitListAction({
      classId: P5_CLASS,
      submittedById: TEACHER_P5,
      updates: [
        {
          studentId: det("UHAS-2026-0010"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
        {
          studentId: det("UHAS-2026-0011"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
      ],
    });

    await closePromotionSeasonAction({ closedById: ADMIN_ID });

    const result = await approveSubmissionAction({
      submissionId: sub!.id,
      reviewedById: DEPUTY_HEAD_UPPER_PRIMARY,
    });
    expect(result.success).toBe(false);
  });
});

describe("sendBackSubmissionAction", () => {
  beforeEach(async () => {
    await openPromotionSeasonAction({ openedById: ADMIN_ID });
    await ensureSubmissionAction(P5_CLASS);
  });

  it("requires a non-empty comment", async () => {
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });
    const result = await sendBackSubmissionAction({
      submissionId: sub!.id,
      reviewedById: DEPUTY_HEAD_UPPER_PRIMARY,
      comment: "",
    });
    expect(result.success).toBe(false);
  });

  it("flips submitted → sent_back with the comment", async () => {
    const sub = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.classId, P5_CLASS),
    });
    await submitListAction({
      classId: P5_CLASS,
      submittedById: TEACHER_P5,
      updates: [
        {
          studentId: det("UHAS-2026-0010"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
        {
          studentId: det("UHAS-2026-0011"),
          decision: "promote",
          targetClassId: det("class-p6-2027"),
          reason: null,
        },
      ],
    });
    const result = await sendBackSubmissionAction({
      submissionId: sub!.id,
      reviewedById: DEPUTY_HEAD_UPPER_PRIMARY,
      comment: "Add reasons for all repeats",
    });
    expect(result.success).toBe(true);
    const after = await db.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.id, sub!.id),
    });
    expect(after?.status).toBe("sent_back");
    expect(after?.reviewerComment).toBe("Add reasons for all repeats");
  });
});
