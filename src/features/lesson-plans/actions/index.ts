"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lessonPlans, classes, subjects, staff, users } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { sendEmail, appUrl } from "@/lib/email";
import { getSchoolSettings } from "@/features/settings/queries/get-school-settings";
import type {
  LessonPlan,
  LessonPlanStatus,
  CreateLessonPlanInput,
  UpdateLessonPlanInput,
  ReviewLessonPlanInput,
} from "@/features/lesson-plans/types";
import type { Division } from "@/features/auth/types";

type ActionResult = { success: true } | { success: false; error: string };

async function hydrateMany(
  rows: (typeof lessonPlans.$inferSelect)[]
): Promise<LessonPlan[]> {
  if (rows.length === 0) return [];
  const teacherIds = Array.from(new Set([
    ...rows.map((r) => r.teacherId),
    ...rows.map((r) => r.reviewedById).filter((id): id is string => !!id),
  ]));
  const subjectIds = Array.from(new Set(rows.map((r) => r.subjectId)));
  const classIds = Array.from(new Set(rows.map((r) => r.classId)));

  const [teacherRows, subjectRows, classRows] = await Promise.all([
    teacherIds.length === 0
      ? []
      : db.query.staff.findMany({ where: inArray(staff.id, teacherIds) }),
    db.query.subjects.findMany({ where: inArray(subjects.id, subjectIds) }),
    db.query.classes.findMany({ where: inArray(classes.id, classIds) }),
  ]);
  const teacherById = new Map(teacherRows.map((t) => [t.id, t]));
  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));
  const classById = new Map(classRows.map((c) => [c.id, c]));

  return rows.map((r) => {
    const t = teacherById.get(r.teacherId);
    const reviewer = r.reviewedById ? teacherById.get(r.reviewedById) : undefined;
    const c = classById.get(r.classId);
    const s = subjectById.get(r.subjectId);
    return {
      id: r.id,
      schoolId: r.schoolId,
      teacherId: r.teacherId,
      teacherName: t ? `${t.firstName} ${t.lastName}` : "",
      subjectId: r.subjectId,
      subjectName: s?.name ?? "",
      classId: r.classId,
      className: c?.name ?? "",
      division: (c?.division as Division) ?? "KG",
      term: r.term,
      week: r.week,
      academicYear: "", // not on schema; reconstruct below
      topic: r.topic,
      learningObjectives: r.learningObjectives,
      teachingMethods: r.teachingMethods,
      resources: r.resources,
      assessmentPlan: r.assessmentPlan,
      fileUrl: r.fileUrl,
      status: (r.status as LessonPlanStatus) ?? "draft",
      reviewerComment: r.reviewerComment,
      reviewedById: r.reviewedById,
      reviewedByName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
    } satisfies LessonPlan;
  });
}

// The lesson_plans schema doesn't carry academicYear directly — we derive it
// from the class's academicYear when needed.
async function attachAcademicYear(plans: LessonPlan[]): Promise<LessonPlan[]> {
  if (plans.length === 0) return plans;
  const classIds = Array.from(new Set(plans.map((p) => p.classId)));
  const classRows = await db.query.classes.findMany({ where: inArray(classes.id, classIds) });
  const yearById = new Map(classRows.map((c) => [c.id, c.academicYear]));
  for (const p of plans) p.academicYear = yearById.get(p.classId) ?? "";
  return plans;
}

function sortByRecent(plans: LessonPlan[]): LessonPlan[] {
  return [...plans].sort((a, b) => {
    if (a.term !== b.term) return b.term - a.term;
    if (a.week !== b.week) return b.week - a.week;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function listLessonPlansForTeacherAction(teacherId: string): Promise<LessonPlan[]> {
  const year = await getCurrentAcademicYear();
  const rows = await db.query.lessonPlans.findMany({
    where: eq(lessonPlans.teacherId, teacherId),
  });
  const hydrated = await attachAcademicYear(await hydrateMany(rows));
  return sortByRecent(hydrated.filter((p) => p.academicYear === year));
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
      ? inArray(lessonPlans.status, statusList)
      : undefined,
  });
  const hydrated = await attachAcademicYear(await hydrateMany(rows));
  return sortByRecent(
    hydrated.filter(
      (p) =>
        p.academicYear === year && (!filter.division || p.division === filter.division)
    )
  );
}

export async function getLessonPlanAction(id: string): Promise<LessonPlan | null> {
  const row = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, id) });
  if (!row) return null;
  const [hydrated] = await attachAcademicYear(await hydrateMany([row]));
  return hydrated ?? null;
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
  const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, input.id) });
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
  const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, input.id) });
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
    where: eq(lessonPlans.id, planId),
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
  const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, input.id) });
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.status !== "submitted") {
    return { success: false, error: "Plan must be submitted for Unit Head review." };
  }
  const reviewer = await db.query.staff.findFirst({ where: eq(staff.id, input.reviewerId) });
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, plan.classId) });
  if (!reviewer || !reviewer.isUnitHead || !cls || reviewer.unitHeadOf !== cls.division) {
    return { success: false, error: "Only the Unit Head for this division can review." };
  }
  const next: LessonPlanStatus =
    input.decision.decision === "approve" ? "unit_head_approved" : "rejected";
  await applyReview(input.id, reviewer.id, next, input.decision.comment);
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
  const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, input.id) });
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.status !== "unit_head_approved" && plan.status !== "submitted") {
    return {
      success: false,
      error: "Plan must be submitted (or Unit-Head approved) for Deputy Head review.",
    };
  }
  const reviewer = await db.query.staff.findFirst({ where: eq(staff.id, input.reviewerId) });
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, plan.classId) });
  if (!reviewer || reviewer.systemRole !== "DeputyHead" || !cls || reviewer.division !== cls.division) {
    return { success: false, error: "Only the Deputy Head of this division can review." };
  }
  const next: LessonPlanStatus =
    input.decision.decision === "approve" ? "approved" : "rejected";
  await applyReview(input.id, reviewer.id, next, input.decision.comment);
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
  const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, input.id) });
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.teacherId !== input.teacherId) {
    return { success: false, error: "You can only delete your own lesson plans." };
  }
  if (plan.status !== "draft" && plan.status !== "rejected") {
    return { success: false, error: "Only draft or rejected plans can be deleted." };
  }
  await db.delete(lessonPlans).where(eq(lessonPlans.id, input.id));
  revalidatePath("/teacher/lesson-plans");
  return { success: true };
}
