"use server";
import type { ActionResult } from "@/lib/action-result";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { asDbClient } from "@/db/with-tx";
import {
  classes,
  enrollments,
  promotionDecisions,
  promotionSeasons,
  promotionSubmissions,
  schools,
  scores,
  students,
  subjects,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { writeAuditLog } from "@/lib/audit-log";
import { notifyAudience } from "@/features/notifications/lib/create-notification";
import { nextAcademicYear } from "@/features/promotions/lib/academic-year";
import {
  autoPickTargetClass,
  divisionHasNextYearClasses,
} from "@/features/promotions/lib/next-class-resolver";
import { computePromotionSuggestion } from "@/features/promotions/lib/suggestion";
import {
  findOpenSeasonRow,
  findSeasonRow,
  getTerm3Exam,
  hasPublishedTerm3EndOfTerm,
} from "@/features/promotions/lib/season-state";
import type { PromotionDecisionKind } from "@/features/promotions/types";


async function currentAcademicYear(): Promise<string> {
  const schoolId = await getCurrentSchoolId();
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  return school?.academicYear ?? "2025/2026";
}

// ─── Season ──────────────────────────────────────────────────────────────────

export async function openPromotionSeasonAction(input: {
  openedById: string;
  override?: boolean;
}): Promise<
  | { success: true; openedWithOverride: boolean }
  | { success: false; error: string; requiresOverride?: boolean }
> {
  const schoolId = await getCurrentSchoolId();
  const year = await currentAcademicYear();

  const existing = await findSeasonRow(year);
  if (existing?.status === "open") {
    return { success: false, error: "Promotion season is already open." };
  }

  const examPublished = await hasPublishedTerm3EndOfTerm(year);
  if (!examPublished && !input.override) {
    return {
      success: false,
      error:
        "Term 3 End-of-Term exam is not published yet. Open with override to proceed without algorithmic suggestions.",
      requiresOverride: true,
    };
  }

  const now = new Date();
  if (existing) {
    await db
      .update(promotionSeasons)
      .set({
        status: "open",
        openedWithOverride: !examPublished,
        openedById: input.openedById,
        openedAt: now,
        closedById: null,
        closedAt: null,
        updatedAt: now,
      })
      .where(eq(promotionSeasons.id, existing.id));
  } else {
    await db.insert(promotionSeasons).values({
      schoolId,
      academicYear: year,
      status: "open",
      openedWithOverride: !examPublished,
      openedById: input.openedById,
      openedAt: now,
    });
  }

  // Tell every teacher the season is open + how long they have. The seed
  // teachers have isPrimary class-teacher rows; everyone with role=Teacher
  // gets the notification regardless of class assignment.
  await notifyAudience(
    { type: "allTeachers" },
    {
      kind: "promotion_season_opened",
      title: "Promotion season opened",
      body: `Submit promotion decisions for your students in ${year}.`,
      link: `/teacher/promotions`,
    }
  );

  revalidatePath("/admin/promotions");
  revalidatePath("/teacher/promotions");
  revalidatePath("/deputy-head/promotions");
  return { success: true, openedWithOverride: !examPublished };
}

export async function closePromotionSeasonAction(input: {
  closedById: string;
}): Promise<ActionResult> {
  const season = await findOpenSeasonRow();
  if (!season) return { success: false, error: "No open promotion season." };

  await db
    .update(promotionSeasons)
    .set({
      status: "closed",
      closedById: input.closedById,
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(promotionSeasons.id, season.id));

  revalidatePath("/admin/promotions");
  revalidatePath("/teacher/promotions");
  revalidatePath("/deputy-head/promotions");
  return { success: true };
}

// ─── Submission helpers ──────────────────────────────────────────────────────

async function findOrCreateSubmission(classId: string) {
  const schoolId = await getCurrentSchoolId();
  const year = await currentAcademicYear();
  const existing = await db.query.promotionSubmissions.findFirst({
    where: and(
      eq(promotionSubmissions.classId, classId),
      eq(promotionSubmissions.academicYear, year)
    ),
  });
  if (existing) return existing;

  const [inserted] = await db
    .insert(promotionSubmissions)
    .values({
      schoolId,
      classId,
      academicYear: year,
      status: "draft",
    })
    .returning();
  return inserted;
}

async function ensureDecisionsForRoster(submissionId: string, classId: string) {
  const year = await currentAcademicYear();
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!cls) return;

  const term3Exam = await getTerm3Exam(year);
  const examPublished = !!term3Exam;

  const [coreSubjects, nextYearClassRows, rosterRows, existingDecisions] = await Promise.all([
    db.query.subjects.findMany({
      where: and(eq(subjects.division, cls.division), eq(subjects.category, "Core")),
    }),
    db.query.classes.findMany({
      where: and(
        eq(classes.academicYear, nextAcademicYear(cls.academicYear)),
        eq(classes.division, cls.division)
      ),
    }),
    db
      .select({ id: students.id })
      .from(enrollments)
      .innerJoin(students, eq(students.id, enrollments.studentId))
      .where(
        and(
          eq(enrollments.classId, classId),
          eq(enrollments.academicYear, year),
          eq(enrollments.status, "Active"),
          eq(students.isActive, true)
        )
      ),
    db.query.promotionDecisions.findMany({
      where: eq(promotionDecisions.submissionId, submissionId),
    }),
  ]);
  const existingByStudent = new Set(existingDecisions.map((d) => d.studentId));

  const newDecisions: (typeof promotionDecisions.$inferInsert)[] = [];
  for (const s of rosterRows) {
    if (existingByStudent.has(s.id)) continue;

    const studentScores = term3Exam
      ? await db.query.scores.findMany({
          where: and(eq(scores.examId, term3Exam.id), eq(scores.studentId, s.id)),
        })
      : [];

    const suggestion = computePromotionSuggestion({
      className: cls.name,
      divisionCoreSubjects: coreSubjects.map((c) => ({
        id: c.id,
        schoolId: c.schoolId,
        name: c.name,
        division: c.division as never,
        category: (c.category as "Core" | "Elective") ?? "Core",
      })),
      scoresForStudent: studentScores.map((sc) => ({
        id: sc.id,
        examId: sc.examId,
        studentId: sc.studentId,
        subjectId: sc.subjectId,
        cat1: sc.cat1,
        cat2: sc.cat2,
        projectWork: sc.projectWork,
        groupWork: sc.groupWork,
        examScore: sc.examScore,
        totalScore: sc.totalScore,
        grade: sc.grade,
        interpretation: sc.interpretation,
        subjectPosition: sc.subjectPosition,
        createdAt: sc.createdAt?.toISOString() ?? "",
        updatedAt: sc.updatedAt?.toISOString() ?? "",
      })),
      examPublished,
    });

    const initialDecision: PromotionDecisionKind =
      suggestion?.suggestedDecision ?? (cls.name.startsWith("JHS 3") ? "graduate" : "promote");

    const targetClassId =
      initialDecision === "promote"
        ? autoPickTargetClass(cls.name, nextYearClassRows, "promote")
        : initialDecision === "repeat"
          ? autoPickTargetClass(cls.name, nextYearClassRows, "repeat")
          : null;

    newDecisions.push({
      submissionId,
      studentId: s.id,
      decision: initialDecision,
      targetClassId,
      reason: null,
      suggestedDecision: suggestion?.suggestedDecision ?? null,
      suggestedReason: suggestion?.suggestedReason ?? null,
      failedCoreSubjects: suggestion?.failedCoreSubjects ?? null,
    });
  }
  if (newDecisions.length > 0) {
    await db.insert(promotionDecisions).values(newDecisions);
  }
}

export async function ensureSubmissionAction(classId: string): Promise<
  { success: true; submissionId: string } | { success: false; error: string }
> {
  const open = await findOpenSeasonRow();
  if (!open) return { success: false, error: "Promotion season is closed." };
  const submission = await findOrCreateSubmission(classId);
  await ensureDecisionsForRoster(submission.id, classId);
  return { success: true, submissionId: submission.id };
}

// ─── Decision edits ──────────────────────────────────────────────────────────

export type DecisionUpdate = {
  studentId: string;
  decision: PromotionDecisionKind;
  targetClassId: string | null;
  reason: string | null;
};

async function applyDecisionUpdates(
  submissionId: string,
  updates: DecisionUpdate[]
): Promise<ActionResult> {
  for (const u of updates) {
    await db
      .update(promotionDecisions)
      .set({
        decision: u.decision,
        targetClassId: u.targetClassId,
        reason: u.reason && u.reason.trim() ? u.reason.trim() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(promotionDecisions.submissionId, submissionId),
          eq(promotionDecisions.studentId, u.studentId)
        )
      );
  }
  return { success: true };
}

export async function saveDraftAction(input: {
  classId: string;
  updates: DecisionUpdate[];
}): Promise<ActionResult> {
  const open = await findOpenSeasonRow();
  if (!open) return { success: false, error: "Promotion season is closed." };

  const year = await currentAcademicYear();
  const submission = await db.query.promotionSubmissions.findFirst({
    where: and(
      eq(promotionSubmissions.classId, input.classId),
      eq(promotionSubmissions.academicYear, year)
    ),
  });
  if (!submission) return { success: false, error: "No submission yet — open the page first." };
  if (submission.status === "approved") {
    return { success: false, error: "Already approved; cannot edit." };
  }

  await applyDecisionUpdates(submission.id, input.updates);

  if (submission.status === "sent_back") {
    await db
      .update(promotionSubmissions)
      .set({ status: "draft", updatedAt: new Date() })
      .where(eq(promotionSubmissions.id, submission.id));
  }
  revalidatePath(`/teacher/promotions/${input.classId}`);
  return { success: true };
}

export async function submitListAction(input: {
  classId: string;
  submittedById: string;
  updates: DecisionUpdate[];
}): Promise<ActionResult> {
  const open = await findOpenSeasonRow();
  if (!open) return { success: false, error: "Promotion season is closed." };

  const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.classId) });
  if (!cls) return { success: false, error: "Class not found." };

  const year = await currentAcademicYear();
  const submission = await db.query.promotionSubmissions.findFirst({
    where: and(
      eq(promotionSubmissions.classId, input.classId),
      eq(promotionSubmissions.academicYear, year)
    ),
  });
  if (!submission) return { success: false, error: "No submission yet — open the page first." };
  if (submission.status === "approved") return { success: false, error: "Already approved." };
  if (submission.status === "submitted") return { success: false, error: "Already submitted." };

  // Pre-flight: next-year classes exist for this division
  const nextYearClassesList = await db.query.classes.findMany({
    where: and(
      eq(classes.academicYear, nextAcademicYear(cls.academicYear)),
      eq(classes.division, cls.division)
    ),
  });
  if (!divisionHasNextYearClasses(cls.division, nextYearClassesList)) {
    return {
      success: false,
      error: `No ${nextAcademicYear(cls.academicYear)} classes exist for ${cls.division}. Ask Admin to set them up first.`,
    };
  }

  await applyDecisionUpdates(submission.id, input.updates);

  // Validate every roster student has a complete decision
  const decisions = await db.query.promotionDecisions.findMany({
    where: eq(promotionDecisions.submissionId, submission.id),
  });
  for (const d of decisions) {
    if (d.decision === "promote" && !d.targetClassId) {
      return { success: false, error: "Every promoted student needs a target class." };
    }
    if ((d.decision === "repeat" || d.decision === "withdraw") && !d.reason) {
      return { success: false, error: `Every ${d.decision} decision needs a reason.` };
    }
  }

  const now = new Date();
  await db
    .update(promotionSubmissions)
    .set({
      status: "submitted",
      submittedById: input.submittedById,
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(promotionSubmissions.id, submission.id));

  revalidatePath(`/teacher/promotions/${input.classId}`);
  revalidatePath("/deputy-head/promotions");
  return { success: true };
}

// ─── DH review (real enrollment materialisation) ─────────────────────────────

export async function approveSubmissionAction(input: {
  submissionId: string;
  reviewedById: string;
}): Promise<ActionResult> {
  const open = await findOpenSeasonRow();
  if (!open) return { success: false, error: "Promotion season is closed." };

  const session = await getSessionUser();
  const actor = session?.uid ?? "system";

  const result = await db.transaction(async (tx) => {
    const sub = await tx.query.promotionSubmissions.findFirst({
      where: eq(promotionSubmissions.id, input.submissionId),
    });
    if (!sub) return { ok: false as const, error: "Submission not found." };
    if (sub.status !== "submitted") {
      return { ok: false as const, error: "Only submitted lists can be approved." };
    }

    const cls = await tx.query.classes.findFirst({ where: eq(classes.id, sub.classId) });
    if (!cls) return { ok: false as const, error: "Class not found." };

    const decisions = await tx.query.promotionDecisions.findMany({
      where: eq(promotionDecisions.submissionId, sub.id),
    });
    const studentIds = decisions.map((d) => d.studentId);

    // 1. Close current-year enrollments for these students
    if (studentIds.length > 0) {
      await tx
        .update(enrollments)
        .set({ status: "Completed" })
        .where(
          and(
            inArray(enrollments.studentId, studentIds),
            eq(enrollments.academicYear, sub.academicYear),
            eq(enrollments.status, "Active")
          )
        );
    }

    // 2. New enrollments for Promote + Repeat
    const targetYear = nextAcademicYear(sub.academicYear);
    const promoteRepeat = decisions.filter(
      (d) => d.decision === "promote" || d.decision === "repeat"
    );
    if (promoteRepeat.length > 0) {
      const inserts = promoteRepeat
        .filter((d) => d.targetClassId)
        .map((d) => ({
          studentId: d.studentId,
          classId: d.targetClassId!,
          academicYear: targetYear,
          status: d.decision === "repeat" ? "Repeating" : "Active",
          enrollmentDate: new Date().toISOString().slice(0, 10),
        }));
      if (inserts.length > 0) await tx.insert(enrollments).values(inserts);
    }

    // 3. Withdraw → flip students.isActive=false
    const withdrawIds = decisions.filter((d) => d.decision === "withdraw").map((d) => d.studentId);
    if (withdrawIds.length > 0) {
      await tx.update(students).set({ isActive: false }).where(inArray(students.id, withdrawIds));
    }

    // 4. Submission status
    const now = new Date();
    await tx
      .update(promotionSubmissions)
      .set({
        status: "approved",
        reviewedById: input.reviewedById,
        reviewedAt: now,
        reviewerComment: null,
        updatedAt: now,
      })
      .where(eq(promotionSubmissions.id, sub.id));

    // 5. Audit log
    await writeAuditLog(asDbClient(tx), {
      userId: actor,
      action: "PROMOTION_APPROVED",
      targetTable: "promotion_submissions",
      targetId: sub.id,
      after: {
        decisionCount: decisions.length,
        promoted: decisions.filter((d) => d.decision === "promote").length,
        repeating: decisions.filter((d) => d.decision === "repeat").length,
        withdrawn: decisions.filter((d) => d.decision === "withdraw").length,
        graduated: decisions.filter((d) => d.decision === "graduate").length,
      },
    });

    return { ok: true as const };
  });

  if (!result.ok) return { success: false, error: result.error };
  revalidatePath("/deputy-head/promotions");
  revalidatePath("/admin/promotions");
  return { success: true };
}

export async function sendBackSubmissionAction(input: {
  submissionId: string;
  reviewedById: string;
  comment: string;
}): Promise<ActionResult> {
  const open = await findOpenSeasonRow();
  if (!open) return { success: false, error: "Promotion season is closed." };

  if (!input.comment.trim()) {
    return { success: false, error: "Please add a comment explaining what to revise." };
  }
  const sub = await db.query.promotionSubmissions.findFirst({
    where: eq(promotionSubmissions.id, input.submissionId),
  });
  if (!sub) return { success: false, error: "Submission not found." };
  if (sub.status !== "submitted") {
    return { success: false, error: "Only submitted lists can be sent back." };
  }
  const now = new Date();
  await db
    .update(promotionSubmissions)
    .set({
      status: "sent_back",
      reviewerComment: input.comment.trim(),
      reviewedById: input.reviewedById,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(promotionSubmissions.id, sub.id));

  revalidatePath("/deputy-head/promotions");
  revalidatePath(`/teacher/promotions/${sub.classId}`);
  return { success: true };
}

