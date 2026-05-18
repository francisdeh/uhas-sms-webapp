"use server";

import { mockLessonPlans } from "@/lib/mock/lesson-plans";
import { mockSubjects } from "@/lib/mock/subjects";
import { mockClasses } from "@/lib/mock/classes";
import { mockStaff } from "@/lib/mock/staff";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type {
  LessonPlan,
  LessonPlanStatus,
  CreateLessonPlanInput,
  UpdateLessonPlanInput,
  ReviewLessonPlanInput,
} from "@/features/lesson-plans/types";
import type { Division } from "@/features/auth/types";

type ActionResult = { success: true } | { success: false; error: string };

const lessonPlans = mockLessonPlans;

function sortByRecent(plans: LessonPlan[]): LessonPlan[] {
  return [...plans].sort((a, b) => {
    if (a.term !== b.term) return b.term - a.term;
    if (a.week !== b.week) return b.week - a.week;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function listLessonPlansForTeacherAction(teacherId: string): Promise<LessonPlan[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const year = await getCurrentAcademicYear();
  return sortByRecent(
    lessonPlans.filter((p) => p.teacherId === teacherId && p.academicYear === year)
  );
}

export async function listLessonPlansForReviewAction(filter: {
  division?: Division;
  status?: LessonPlanStatus | LessonPlanStatus[];
}): Promise<LessonPlan[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const year = await getCurrentAcademicYear();
  const statusSet = filter.status
    ? new Set(Array.isArray(filter.status) ? filter.status : [filter.status])
    : null;
  return sortByRecent(
    lessonPlans.filter((p) => {
      if (p.academicYear !== year) return false;
      if (filter.division && p.division !== filter.division) return false;
      if (statusSet && !statusSet.has(p.status)) return false;
      return true;
    })
  );
}

export async function getLessonPlanAction(id: string): Promise<LessonPlan | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  return lessonPlans.find((p) => p.id === id) ?? null;
}

function lookupNames(teacherId: string, subjectId: string, classId: string) {
  const teacher = mockStaff.find((s) => s.id === teacherId);
  const subject = mockSubjects.find((s) => s.id === subjectId);
  const cls = mockClasses.find((c) => c.id === classId);
  return {
    teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : "",
    subjectName: subject?.name ?? "",
    className: cls?.name ?? "",
    division: cls?.division,
  };
}

export async function createLessonPlanAction(input: {
  teacherId: string;
  data: CreateLessonPlanInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }

  const names = lookupNames(input.teacherId, input.data.subjectId, input.data.classId);
  if (!names.division) {
    return { success: false, error: "Class not found." };
  }

  const id = `lp-${Date.now()}`;
  const now = new Date().toISOString();
  lessonPlans.push({
    id,
    schoolId: "school-uhas-001",
    teacherId: input.teacherId,
    teacherName: names.teacherName,
    subjectId: input.data.subjectId,
    subjectName: names.subjectName,
    classId: input.data.classId,
    className: names.className,
    division: names.division,
    term: input.data.term,
    week: input.data.week,
    academicYear: await getCurrentAcademicYear(),
    topic: input.data.topic ?? null,
    learningObjectives: input.data.learningObjectives ?? null,
    teachingMethods: input.data.teachingMethods ?? null,
    resources: input.data.resources ?? null,
    assessmentPlan: input.data.assessmentPlan ?? null,
    fileUrl: input.data.fileUrl ?? null,
    status: "draft",
    reviewerComment: null,
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { success: true, id };
}

export async function updateLessonPlanAction(input: {
  id: string;
  teacherId: string;
  data: UpdateLessonPlanInput;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }

  const plan = lessonPlans.find((p) => p.id === input.id);
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.teacherId !== input.teacherId) {
    return { success: false, error: "You can only edit your own lesson plans." };
  }
  if (plan.status === "approved" || plan.status === "unit_head_approved") {
    return { success: false, error: "Approved plans cannot be edited." };
  }

  if (input.data.subjectId !== undefined || input.data.classId !== undefined) {
    const subjectId = input.data.subjectId ?? plan.subjectId;
    const classId = input.data.classId ?? plan.classId;
    const names = lookupNames(plan.teacherId, subjectId, classId);
    if (!names.division) return { success: false, error: "Class not found." };
    plan.subjectId = subjectId;
    plan.subjectName = names.subjectName;
    plan.classId = classId;
    plan.className = names.className;
    plan.division = names.division;
  }

  if (input.data.term !== undefined) plan.term = input.data.term;
  if (input.data.week !== undefined) plan.week = input.data.week;
  if (input.data.topic !== undefined) plan.topic = input.data.topic || null;
  if (input.data.learningObjectives !== undefined)
    plan.learningObjectives = input.data.learningObjectives || null;
  if (input.data.teachingMethods !== undefined)
    plan.teachingMethods = input.data.teachingMethods || null;
  if (input.data.resources !== undefined) plan.resources = input.data.resources || null;
  if (input.data.assessmentPlan !== undefined)
    plan.assessmentPlan = input.data.assessmentPlan || null;
  if (input.data.fileUrl !== undefined) plan.fileUrl = input.data.fileUrl || null;

  // If a teacher edits a previously-rejected or submitted plan, drop back to draft
  if (plan.status === "rejected" || plan.status === "submitted") {
    plan.status = "draft";
    plan.reviewerComment = null;
    plan.reviewedById = null;
    plan.reviewedByName = null;
    plan.reviewedAt = null;
  }

  plan.updatedAt = new Date().toISOString();
  return { success: true };
}

export async function submitLessonPlanAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }
  const plan = lessonPlans.find((p) => p.id === input.id);
  if (!plan) return { success: false, error: "Lesson plan not found." };
  if (plan.teacherId !== input.teacherId)
    return { success: false, error: "You can only submit your own lesson plans." };
  if (plan.status !== "draft" && plan.status !== "rejected") {
    return { success: false, error: "Plan must be a draft to submit." };
  }

  // Require core fields
  if (!plan.topic || !plan.learningObjectives) {
    return { success: false, error: "Add a topic and learning objectives before submitting." };
  }

  plan.status = "submitted";
  plan.reviewerComment = null;
  plan.reviewedById = null;
  plan.reviewedByName = null;
  plan.reviewedAt = null;
  plan.updatedAt = new Date().toISOString();
  return { success: true };
}

function applyReview(
  plan: LessonPlan,
  reviewerId: string,
  reviewerName: string,
  nextStatus: LessonPlanStatus,
  comment?: string
) {
  plan.status = nextStatus;
  plan.reviewerComment = comment?.trim() || null;
  plan.reviewedById = reviewerId;
  plan.reviewedByName = reviewerName;
  plan.reviewedAt = new Date().toISOString();
  plan.updatedAt = plan.reviewedAt;
}

export async function unitHeadReviewAction(input: {
  id: string;
  reviewerId: string;
  decision: ReviewLessonPlanInput;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }
  const plan = lessonPlans.find((p) => p.id === input.id);
  if (!plan) return { success: false, error: "Lesson plan not found." };

  const reviewer = mockStaff.find((s) => s.id === input.reviewerId);
  if (!reviewer || !reviewer.isUnitHead || reviewer.unitHeadOf !== plan.division) {
    return { success: false, error: "Only the Unit Head for this division can review." };
  }

  if (plan.status !== "submitted") {
    return { success: false, error: "Plan must be submitted for Unit Head review." };
  }

  const next: LessonPlanStatus =
    input.decision.decision === "approve" ? "unit_head_approved" : "rejected";
  applyReview(plan, reviewer.id, `${reviewer.firstName} ${reviewer.lastName}`, next, input.decision.comment);
  return { success: true };
}

export async function deputyHeadReviewAction(input: {
  id: string;
  reviewerId: string;
  decision: ReviewLessonPlanInput;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }
  const plan = lessonPlans.find((p) => p.id === input.id);
  if (!plan) return { success: false, error: "Lesson plan not found." };

  const reviewer = mockStaff.find((s) => s.id === input.reviewerId);
  if (!reviewer || reviewer.systemRole !== "DeputyHead" || reviewer.division !== plan.division) {
    return { success: false, error: "Only the Deputy Head of this division can review." };
  }

  if (plan.status !== "unit_head_approved" && plan.status !== "submitted") {
    return {
      success: false,
      error: "Plan must be submitted (or Unit-Head approved) for Deputy Head review.",
    };
  }

  const next: LessonPlanStatus =
    input.decision.decision === "approve" ? "approved" : "rejected";
  applyReview(plan, reviewer.id, `${reviewer.firstName} ${reviewer.lastName}`, next, input.decision.comment);
  return { success: true };
}

export async function deleteLessonPlanAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") {
    return { success: false, error: "DB not connected" };
  }
  const idx = lessonPlans.findIndex((p) => p.id === input.id);
  if (idx === -1) return { success: false, error: "Lesson plan not found." };
  if (lessonPlans[idx].teacherId !== input.teacherId) {
    return { success: false, error: "You can only delete your own lesson plans." };
  }
  if (lessonPlans[idx].status !== "draft" && lessonPlans[idx].status !== "rejected") {
    return { success: false, error: "Only draft or rejected plans can be deleted." };
  }
  lessonPlans.splice(idx, 1);
  return { success: true };
}

