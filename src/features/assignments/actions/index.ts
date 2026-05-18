"use server";

import { mockAssignments } from "@/lib/mock/assignments";
import { mockSubjects } from "@/lib/mock/subjects";
import { mockClasses } from "@/lib/mock/classes";
import { mockStaff } from "@/lib/mock/staff";
import { mockStudents } from "@/lib/mock/students";
import type {
  Assignment,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from "@/features/assignments/types";

type ActionResult = { success: true } | { success: false; error: string };

const assignments = mockAssignments;

function lookup(teacherId: string, subjectId: string, classId: string) {
  const teacher = mockStaff.find((s) => s.id === teacherId);
  const subject = mockSubjects.find((s) => s.id === subjectId);
  const cls = mockClasses.find((c) => c.id === classId);
  return {
    teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : "",
    subjectName: subject?.name ?? "",
    className: cls?.name ?? "",
  };
}

export async function listAssignmentsForTeacherAction(teacherId: string): Promise<Assignment[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return [...assignments]
    .filter((a) => a.teacherId === teacherId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAssignmentAction(id: string): Promise<Assignment | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;
  return assignments.find((a) => a.id === id) ?? null;
}

export async function listAssignmentsForStudentsAction(
  studentIds: string[]
): Promise<Assignment[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const classIds = new Set(
    mockStudents
      .filter((s) => studentIds.includes(s.id) && s.isActive)
      .map((s) => s.classId)
  );
  return [...assignments]
    .filter((a) => a.status === "published" && classIds.has(a.classId))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

export async function createAssignmentAction(input: {
  teacherId: string;
  data: CreateAssignmentInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const names = lookup(input.teacherId, input.data.subjectId, input.data.classId);
  if (!names.className) return { success: false, error: "Class not found." };

  const id = `assign-${Date.now()}`;
  const now = new Date().toISOString();
  assignments.push({
    id,
    schoolId: "school-uhas-001",
    teacherId: input.teacherId,
    teacherName: names.teacherName,
    subjectId: input.data.subjectId,
    subjectName: names.subjectName,
    classId: input.data.classId,
    className: names.className,
    title: input.data.title,
    description: input.data.description ?? null,
    fileUrl: input.data.fileUrl ?? null,
    dueDate: input.data.dueDate,
    status: "draft",
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { success: true, id };
}

export async function updateAssignmentAction(input: {
  id: string;
  teacherId: string;
  data: UpdateAssignmentInput;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const assignment = assignments.find((a) => a.id === input.id);
  if (!assignment) return { success: false, error: "Assignment not found." };
  if (assignment.teacherId !== input.teacherId)
    return { success: false, error: "You can only edit your own assignments." };

  if (input.data.subjectId !== undefined || input.data.classId !== undefined) {
    const subjectId = input.data.subjectId ?? assignment.subjectId;
    const classId = input.data.classId ?? assignment.classId;
    const names = lookup(assignment.teacherId, subjectId, classId);
    if (!names.className) return { success: false, error: "Class not found." };
    assignment.subjectId = subjectId;
    assignment.subjectName = names.subjectName;
    assignment.classId = classId;
    assignment.className = names.className;
  }
  if (input.data.title !== undefined) assignment.title = input.data.title;
  if (input.data.description !== undefined)
    assignment.description = input.data.description || null;
  if (input.data.fileUrl !== undefined) assignment.fileUrl = input.data.fileUrl || null;
  if (input.data.dueDate !== undefined) assignment.dueDate = input.data.dueDate;

  assignment.updatedAt = new Date().toISOString();
  return { success: true };
}

export async function publishAssignmentAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const assignment = assignments.find((a) => a.id === input.id);
  if (!assignment) return { success: false, error: "Assignment not found." };
  if (assignment.teacherId !== input.teacherId)
    return { success: false, error: "You can only publish your own assignments." };
  if (assignment.status === "published")
    return { success: false, error: "Already published." };

  assignment.status = "published";
  assignment.publishedAt = new Date().toISOString();
  assignment.updatedAt = assignment.publishedAt;
  return { success: true };
}

export async function unpublishAssignmentAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const assignment = assignments.find((a) => a.id === input.id);
  if (!assignment) return { success: false, error: "Assignment not found." };
  if (assignment.teacherId !== input.teacherId)
    return { success: false, error: "You can only unpublish your own assignments." };

  assignment.status = "draft";
  assignment.publishedAt = null;
  assignment.updatedAt = new Date().toISOString();
  return { success: true };
}

export async function deleteAssignmentAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const idx = assignments.findIndex((a) => a.id === input.id);
  if (idx === -1) return { success: false, error: "Assignment not found." };
  if (assignments[idx].teacherId !== input.teacherId)
    return { success: false, error: "You can only delete your own assignments." };
  assignments.splice(idx, 1);
  return { success: true };
}
