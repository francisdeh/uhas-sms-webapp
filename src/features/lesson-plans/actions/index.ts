"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlans, classes, subjects, staff, users } from "@/db/schema";
import type { InferSelectModel } from "drizzle-orm";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { sendEmail, appUrl } from "@/lib/email";
import { getSchoolSettings } from "@/features/settings/queries/get-school-settings";
import { notifyAudience } from "@/features/notifications/lib/create-notification";
import type {
  LessonPlan,
  LessonPlanStatus,
  CreateLessonPlanInput,
  UpdateLessonPlanInput,
  ReviewLessonPlanInput,
} from "@/features/lesson-plans/types";
import type { Division } from "@/features/auth/types";

type ActionResult = { success: true } | { success: false; error: string };

// Row shape after a query with `with: { teacher, reviewer, subject, class }`.
type StaffRow = InferSelectModel<typeof staff>;
type SubjectRow = InferSelectModel<typeof subjects>;
type ClassRow = InferSelectModel<typeof classes>;
type LessonPlanWithJoins = InferSelectModel<typeof lessonPlans> & {
  teacher: StaffRow | null;
  reviewer: StaffRow | null;
  subject: SubjectRow | null;
  class: ClassRow | null;
};

const PLAN_WITH = {
  teacher: true,
  reviewer: true,
  subject: true,
  class: true,
} as const;

function hydrateOne(r: LessonPlanWithJoins): LessonPlan {
  return {
    id: r.id,
    schoolId: r.schoolId,
    teacherId: r.teacherId,
    teacherName: r.teacher ? `${r.teacher.firstName} ${r.teacher.lastName}` : "",
    subjectId: r.subjectId,
    subjectName: r.subject?.name ?? "",
    classId: r.classId,
    className: r.class?.name ?? "",
    division: (r.class?.division as Division) ?? "KG",
    term: r.term,
    week: r.week,
    academicYear: r.class?.academicYear ?? "",
    topic: r.topic,
    learningObjectives: r.learningObjectives,
    teachingMethods: r.teachingMethods,
    resources: r.resources,
    assessmentPlan: r.assessmentPlan,
    fileUrl: r.fileUrl,
    status: (r.status as LessonPlanStatus) ?? "draft",
    reviewerComment: r.reviewerComment,
    reviewedById: r.reviewedById,
    reviewedByName: r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
  } satisfies LessonPlan;
}

function sortByRecent(plans: LessonPlan[]): LessonPlan[] {
  return [...plans].sort((a, b) => {
    if (a.term !== b.term) return b.term - a.term;
    if (a.week !== b.week) return b.week - a.week;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

// Excludes soft-deleted rows. Used by every read except the (future) Trash UI.
const NOT_DELETED = isNull(lessonPlans.deletedAt);

export async function listLessonPlansForTeacherAction(teacherId: string): Promise<LessonPlan[]> {
  const year = await getCurrentAcademicYear();
  const rows = await db.query.lessonPlans.findMany({
    where: and(eq(lessonPlans.teacherId, teacherId), NOT_DELETED),
    with: PLAN_WITH,
  });
  return sortByRecent(rows.map(hydrateOne).filter((p) => p.academicYear === year));
}

export async function listLessonPlansForReviewAction(filter: {
  division?: Division;
  status?: LessonPlanStatus | LessonPlanStatus[];
}): Promise<LessonPlan[]> {
  const year = await getCurrentAcademicYear();
  const statusList = filter.status
    ? Array.isArray(filter.status) ? filter.status : [filter.status]
    : null;

  const rows = await db.query.lessonPlans.findMany({
    where: statusList && statusList.length > 0
      ? and(inArray(lessonPlans.status, statusList), NOT_DELETED)
      : NOT_DELETED,
    with: PLAN_WITH,
  });
  return sortByRecent(
    rows
      .map(hydrateOne)
      .filter(
        (p) =>
          p.academicYear === year && (!filter.division || p.division === filter.division)
      )
  );
}

export async function getLessonPlanAction(id: string): Promise<LessonPlan | null> {
  const row = await db.query.lessonPlans.findFirst({
    where: and(eq(lessonPlans.id, id), NOT_DELETED),
    with: PLAN_WITH,
  });
  return row ? hydrateOne(row) : null;
}

async function lookupNames(teacherId: string, subjectId: string, classId: string) {
  const [teacher, subject, cls] = await Promise.all([
    db.query.staff.findFirst({ where: eq(staff.id, teacherId) }),
    db.query.subjects.findFirst({ where: eq(subjects.id, subjectId) }),
    db.query.classes.findFirst({ where: eq(classes.id, classId) }),
  ]);
  return {
    teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : "",
    subjectName: subject?.name ?? "",
    className: cls?.name ?? "",
    division: (cls?.division as Division | undefined) ?? undefined,
  };
}

export async function createLessonPlanAction(input: {
  teacherId: string;
  data: CreateLessonPlanInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const schoolId = await getCurrentSchoolId();
  const names = await lookupNames(input.teacherId, input.data.subjectId, input.data.classId);
  if (!names.division) return { success: false, error: "Class not found." };

  const id = `lp-${Date.now()}`;
  const now = new Date();
  await db.insert(lessonPlans).values({
    id,
    schoolId,
    teacherId: input.teacherId,
    subjectId: input.data.subjectId,
    classId: input.data.classId,
    term: input.data.term,
    week: input.data.week,
    topic: input.data.topic ?? null,
    learningObjectives: input.data.learningObjectives ?? null,
    teachingMethods: input.data.teachingMethods ?? null,
    resources: input.data.resources ?? null,
    assessmentPlan: input.data.assessmentPlan ?? null,
    fileUrl: input.data.fileUrl ?? null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });
  revalidatePath("/teacher/lesson-plans");
  return { success: true, id };
}

export async function updateLessonPlanAction(input: {
  id: string;
  teacherId: string;
  data: UpdateLessonPlanInput;
}): Promise<ActionResult> {
  const plan = await db.query.lessonPlans.findFirst({ where: and(eq(lessonPlans.id, input.id), NOT_DELETED) });
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.teacherId !== input.teacherId) {
    return { success: false, error: "You can only edit your own lesson plans." };
  }
  if (plan.status === "approved" || plan.status === "unit_head_approved") {
    return { success: false, error: "Approved plans cannot be edited." };
  }

  const patch: Partial<typeof lessonPlans.$inferInsert> = { updatedAt: new Date() };
  if (input.data.subjectId !== undefined) patch.subjectId = input.data.subjectId;
  if (input.data.classId !== undefined) patch.classId = input.data.classId;
  if (input.data.term !== undefined) patch.term = input.data.term;
  if (input.data.week !== undefined) patch.week = input.data.week;
  if (input.data.topic !== undefined) patch.topic = input.data.topic || null;
  if (input.data.learningObjectives !== undefined)
    patch.learningObjectives = input.data.learningObjectives || null;
  if (input.data.teachingMethods !== undefined)
    patch.teachingMethods = input.data.teachingMethods || null;
  if (input.data.resources !== undefined) patch.resources = input.data.resources || null;
  if (input.data.assessmentPlan !== undefined)
    patch.assessmentPlan = input.data.assessmentPlan || null;
  if (input.data.fileUrl !== undefined) patch.fileUrl = input.data.fileUrl || null;

  // Validate new class exists when changed
  if (patch.classId) {
    const cls = await db.query.classes.findFirst({ where: eq(classes.id, patch.classId) });
    if (!cls) return { success: false, error: "Class not found." };
  }

  // Teacher edits on rejected/submitted plans drop back to draft
  if (plan.status === "rejected" || plan.status === "submitted") {
    patch.status = "draft";
    patch.reviewerComment = null;
    patch.reviewedById = null;
    patch.reviewedAt = null;
  }

  await db.update(lessonPlans).set(patch).where(eq(lessonPlans.id, input.id));
  revalidatePath("/teacher/lesson-plans");
  revalidatePath(`/teacher/lesson-plans/${input.id}`);
  return { success: true };
}

export async function submitLessonPlanAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  const plan = await db.query.lessonPlans.findFirst({
    where: and(eq(lessonPlans.id, input.id), NOT_DELETED),
    with: { class: true },
  });
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.teacherId !== input.teacherId) {
    return { success: false, error: "You can only submit your own lesson plans." };
  }
  if (plan.status !== "draft" && plan.status !== "rejected") {
    return { success: false, error: "Plan must be a draft to submit." };
  }
  if (!plan.topic || !plan.learningObjectives) {
    return { success: false, error: "Add a topic and learning objectives before submitting." };
  }
  await db
    .update(lessonPlans)
    .set({
      status: "submitted",
      reviewerComment: null,
      reviewedById: null,
      reviewedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(lessonPlans.id, input.id));

  // Notify the Unit Head of the class's division. DH gets pinged when the
  // Unit Head approves (next step in the chain) — too noisy to ping both now.
  if (plan.class?.division) {
    const topic = plan.topic ?? "(untitled)";
    await notifyAudience(
      { type: "unitHeadOfDivision", division: plan.class.division },
      {
        kind: "lesson_plan_submitted",
        title: "Lesson plan submitted",
        body: `A new lesson plan "${topic}" is ready for your review.`,
        link: `/teacher/reviews`,
      }
    );
  }

  revalidatePath("/teacher/lesson-plans");
  return { success: true };
}

async function applyReview(
  id: string,
  reviewerId: string,
  nextStatus: LessonPlanStatus,
  comment?: string
) {
  const now = new Date();
  await db
    .update(lessonPlans)
    .set({
      status: nextStatus,
      reviewerComment: comment?.trim() || null,
      reviewedById: reviewerId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(lessonPlans.id, id));
}

// In-app notification to the submitting teacher when their plan is reviewed.
// Fires for both approve + reject. (Email side stays separate and only fires
// on rejection — see notifyTeacherOfRejection below.)
async function notifyTeacherOfReview(
  planId: string,
  outcome: "approved" | "rejected" | "advanced",
  comment: string | undefined
) {
  const plan = await db.query.lessonPlans.findFirst({
    where: and(eq(lessonPlans.id, planId), NOT_DELETED),
  });
  if (!plan) return;
  const topic = plan.topic ?? "(untitled)";
  const titleByOutcome = {
    approved: "Lesson plan approved",
    rejected: "Lesson plan returned",
    advanced: "Lesson plan advanced",
  };
  const bodyByOutcome = {
    approved: `Your lesson plan "${topic}" was approved.`,
    rejected:
      `Your lesson plan "${topic}" needs changes.` +
      (comment?.trim() ? ` Note: ${comment.trim()}` : ""),
    advanced: `Your lesson plan "${topic}" passed the Unit Head and is awaiting Deputy Head sign-off.`,
  };
  await notifyAudience(
    { type: "staff", staffId: plan.teacherId },
    {
      kind: "lesson_plan_reviewed",
      title: titleByOutcome[outcome],
      body: bodyByOutcome[outcome],
      link: `/teacher/lesson-plans/${plan.id}`,
    }
  );
}

async function notifyTeacherOfRejection(
  planId: string,
  reviewerStaffId: string,
  comment: string | undefined
) {
  // Respect the school-wide notification toggle from /admin/settings →
  // Communication. If "Send email when a lesson plan is rejected" is off,
  // skip the email entirely.
  const settings = await getSchoolSettings();
  if (!settings.notificationDefaults.onLessonPlanRejected) return;

  const plan = await db.query.lessonPlans.findFirst({
    where: and(eq(lessonPlans.id, planId), NOT_DELETED),
  });
  if (!plan) return;
  const [teacherUser, reviewer] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.linkedId, plan.teacherId) }),
    db.query.staff.findFirst({ where: eq(staff.id, reviewerStaffId) }),
  ]);
  if (!teacherUser?.email) return;
  const reviewerName = reviewer
    ? `${reviewer.firstName} ${reviewer.lastName}`
    : "your reviewer";
  const topic = plan.topic ?? "(untitled)";
  const link = appUrl(`/teacher/lesson-plans/${plan.id}`);
  const commentBlock = comment?.trim()
    ? `Reviewer's note:\n${comment.trim()}\n\n`
    : "";
  await sendEmail({
    to: teacherUser.email,
    subject: `Lesson plan returned: ${topic}`,
    text:
      `Hi,\n\n` +
      `Your lesson plan "${topic}" was sent back by ${reviewerName} and needs changes.\n\n` +
      commentBlock +
      `Open it to revise and resubmit:\n${link}\n\n` +
      `— UHAS SMS\n`,
  });
}

export async function unitHeadReviewAction(input: {
  id: string;
  reviewerId: string;
  decision: ReviewLessonPlanInput;
}): Promise<ActionResult> {
  // Plan + class join in one round-trip; reviewer is from input (separate fetch).
  const [planWithClass, reviewer] = await Promise.all([
    db.query.lessonPlans.findFirst({
      where: and(eq(lessonPlans.id, input.id), NOT_DELETED),
      with: { class: true },
    }),
    db.query.staff.findFirst({ where: eq(staff.id, input.reviewerId) }),
  ]);
  if (!planWithClass) return { success: false, error: "Lesson plan not found." };
  if (planWithClass.status !== "submitted") {
    return { success: false, error: "Plan must be submitted for Unit Head review." };
  }
  const cls = planWithClass.class;
  if (!reviewer || !reviewer.isUnitHead || !cls || reviewer.unitHeadOf !== cls.division) {
    return { success: false, error: "Only the Unit Head for this division can review." };
  }
  const next: LessonPlanStatus =
    input.decision.decision === "approve" ? "unit_head_approved" : "rejected";
  await applyReview(input.id, reviewer.id, next, input.decision.comment);

  await notifyTeacherOfReview(
    input.id,
    next === "rejected" ? "rejected" : "advanced",
    input.decision.comment
  );
  if (next === "unit_head_approved" && cls?.division) {
    await notifyAudience(
      { type: "staffByDivision", division: cls.division, roles: ["DeputyHead"] },
      {
        kind: "lesson_plan_submitted",
        title: "Lesson plan ready for Deputy Head review",
        body: `A unit-head-approved lesson plan is awaiting your sign-off.`,
        link: `/deputy-head/lesson-plans`,
      }
    );
  }
  if (next === "rejected") {
    await notifyTeacherOfRejection(input.id, reviewer.id, input.decision.comment);
  }
  revalidatePath("/teacher/reviews");
  revalidatePath("/deputy-head/lesson-plans");
  return { success: true };
}

export async function deputyHeadReviewAction(input: {
  id: string;
  reviewerId: string;
  decision: ReviewLessonPlanInput;
}): Promise<ActionResult> {
  const [planWithClass, reviewer] = await Promise.all([
    db.query.lessonPlans.findFirst({
      where: and(eq(lessonPlans.id, input.id), NOT_DELETED),
      with: { class: true },
    }),
    db.query.staff.findFirst({ where: eq(staff.id, input.reviewerId) }),
  ]);
  if (!planWithClass) return { success: false, error: "Lesson plan not found." };
  if (planWithClass.status !== "unit_head_approved" && planWithClass.status !== "submitted") {
    return {
      success: false,
      error: "Plan must be submitted (or Unit-Head approved) for Deputy Head review.",
    };
  }
  const cls = planWithClass.class;
  if (!reviewer || reviewer.systemRole !== "DeputyHead" || !cls || reviewer.division !== cls.division) {
    return { success: false, error: "Only the Deputy Head of this division can review." };
  }
  const next: LessonPlanStatus =
    input.decision.decision === "approve" ? "approved" : "rejected";
  await applyReview(input.id, reviewer.id, next, input.decision.comment);
  await notifyTeacherOfReview(
    input.id,
    next === "approved" ? "approved" : "rejected",
    input.decision.comment
  );
  if (next === "rejected") {
    await notifyTeacherOfRejection(input.id, reviewer.id, input.decision.comment);
  }
  revalidatePath("/deputy-head/lesson-plans");
  return { success: true };
}

export async function deleteLessonPlanAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  const plan = await db.query.lessonPlans.findFirst({ where: and(eq(lessonPlans.id, input.id), NOT_DELETED) });
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.teacherId !== input.teacherId) {
    return { success: false, error: "You can only delete your own lesson plans." };
  }
  if (plan.status !== "draft" && plan.status !== "rejected") {
    return { success: false, error: "Only draft or rejected plans can be deleted." };
  }
  // Soft delete: mark deletedAt and let reads filter it out. Hard delete
  // is reserved for an admin Trash UI (future).
  await db
    .update(lessonPlans)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(lessonPlans.id, input.id));
  revalidatePath("/teacher/lesson-plans");
  return { success: true };
}
