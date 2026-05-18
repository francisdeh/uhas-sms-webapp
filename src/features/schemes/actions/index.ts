"use server";

import { mockSchemes } from "@/lib/mock/schemes";
import { mockSubjects } from "@/lib/mock/subjects";
import { mockClasses } from "@/lib/mock/classes";
import { mockStaff } from "@/lib/mock/staff";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type {
  Scheme,
  SchemeStatus,
  SchemeType,
  CreateSchemeInput,
  UpdateSchemeInput,
} from "@/features/schemes/types";

type ActionResult = { success: true } | { success: false; error: string };

const schemes = mockSchemes;

function lookup(teacherId: string, subjectId: string, classId: string) {
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

export async function listSchemesForTeacherAction(teacherId: string): Promise<Scheme[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const year = await getCurrentAcademicYear();
  return [...schemes]
    .filter((s) => s.teacherId === teacherId && s.academicYear === year)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSchemesAction(filter?: {
  status?: SchemeStatus | SchemeStatus[];
  type?: SchemeType;
}): Promise<Scheme[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const year = await getCurrentAcademicYear();
  const statusSet = filter?.status
    ? new Set(Array.isArray(filter.status) ? filter.status : [filter.status])
    : null;
  return [...schemes]
    .filter((s) => {
      if (s.academicYear !== year) return false;
      if (statusSet && !statusSet.has(s.status)) return false;
      if (filter?.type && s.type !== filter.type) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSchemeAction(id: string): Promise<Scheme | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  return schemes.find((s) => s.id === id) ?? null;
}

export async function createSchemeAction(input: {
  teacherId: string;
  data: CreateSchemeInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const names = lookup(input.teacherId, input.data.subjectId, input.data.classId);
  if (!names.division) return { success: false, error: "Class not found." };
  if (!input.data.fileUrl && !input.data.content) {
    return { success: false, error: "Provide either an upload URL or structured content." };
  }

  const id = `scheme-${Date.now()}`;
  const now = new Date().toISOString();
  schemes.push({
    id,
    schoolId: "school-uhas-001",
    teacherId: input.teacherId,
    teacherName: names.teacherName,
    subjectId: input.data.subjectId,
    subjectName: names.subjectName,
    classId: input.data.classId,
    className: names.className,
    division: names.division,
    type: input.data.type,
    term: input.data.term,
    academicYear: await getCurrentAcademicYear(),
    title: input.data.title,
    fileUrl: input.data.fileUrl ?? null,
    content: input.data.content ?? null,
    status: "draft",
    reviewerComment: null,
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { success: true, id };
}

export async function updateSchemeAction(input: {
  id: string;
  teacherId: string;
  data: UpdateSchemeInput;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const scheme = schemes.find((s) => s.id === input.id);
  if (!scheme) return { success: false, error: "Scheme not found." };
  if (scheme.teacherId !== input.teacherId)
    return { success: false, error: "You can only edit your own schemes." };
  if (scheme.status === "acknowledged")
    return { success: false, error: "Acknowledged schemes are locked." };

  if (input.data.subjectId !== undefined || input.data.classId !== undefined) {
    const subjectId = input.data.subjectId ?? scheme.subjectId;
    const classId = input.data.classId ?? scheme.classId;
    const names = lookup(scheme.teacherId, subjectId, classId);
    if (!names.division) return { success: false, error: "Class not found." };
    scheme.subjectId = subjectId;
    scheme.subjectName = names.subjectName;
    scheme.classId = classId;
    scheme.className = names.className;
    scheme.division = names.division;
  }
  if (input.data.type !== undefined) scheme.type = input.data.type;
  if (input.data.term !== undefined) scheme.term = input.data.term;
  if (input.data.title !== undefined) scheme.title = input.data.title;
  if (input.data.fileUrl !== undefined) scheme.fileUrl = input.data.fileUrl || null;
  if (input.data.content !== undefined) scheme.content = input.data.content || null;

  if (scheme.status === "submitted") {
    // Edits after submission drop status back to draft so the teacher must resubmit
    scheme.status = "draft";
    scheme.submittedAt = null;
  }
  scheme.updatedAt = new Date().toISOString();
  return { success: true };
}

export async function submitSchemeAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const scheme = schemes.find((s) => s.id === input.id);
  if (!scheme) return { success: false, error: "Scheme not found." };
  if (scheme.teacherId !== input.teacherId)
    return { success: false, error: "You can only submit your own schemes." };
  if (scheme.status !== "draft") return { success: false, error: "Only drafts can be submitted." };

  if (!scheme.fileUrl && !scheme.content) {
    return { success: false, error: "Add a file URL or content before submitting." };
  }

  scheme.status = "submitted";
  scheme.submittedAt = new Date().toISOString();
  scheme.updatedAt = scheme.submittedAt;
  return { success: true };
}

export async function acknowledgeSchemeAction(input: {
  id: string;
  reviewerId: string;
  comment?: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const scheme = schemes.find((s) => s.id === input.id);
  if (!scheme) return { success: false, error: "Scheme not found." };

  const reviewer = mockStaff.find((s) => s.id === input.reviewerId);
  if (!reviewer || reviewer.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can acknowledge schemes." };
  }
  if (scheme.status !== "submitted") {
    return { success: false, error: "Scheme must be submitted to acknowledge." };
  }

  scheme.status = "acknowledged";
  scheme.reviewerComment = input.comment?.trim() || null;
  scheme.reviewedById = reviewer.id;
  scheme.reviewedByName = `${reviewer.firstName} ${reviewer.lastName}`;
  scheme.reviewedAt = new Date().toISOString();
  scheme.updatedAt = scheme.reviewedAt;
  return { success: true };
}

export async function deleteSchemeAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const idx = schemes.findIndex((s) => s.id === input.id);
  if (idx === -1) return { success: false, error: "Scheme not found." };
  if (schemes[idx].teacherId !== input.teacherId)
    return { success: false, error: "You can only delete your own schemes." };
  if (schemes[idx].status === "acknowledged") {
    return { success: false, error: "Acknowledged schemes cannot be deleted." };
  }
  schemes.splice(idx, 1);
  return { success: true };
}
