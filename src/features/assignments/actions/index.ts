"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { assignments, classes, subjects, staff, enrollments } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { notifyAudience } from "@/features/notifications/lib/create-notification";
import type {
  Assignment,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from "@/features/assignments/types";

type ActionResult = { success: true } | { success: false; error: string };

async function hydrateMany(rows: (typeof assignments.$inferSelect)[]): Promise<Assignment[]> {
  if (rows.length === 0) return [];
  const teacherIds = Array.from(new Set(rows.map((r) => r.teacherId)));
  const subjectIds = Array.from(new Set(rows.map((r) => r.subjectId)));
  const classIds = Array.from(new Set(rows.map((r) => r.classId)));

  const [teacherRows, subjectRows, classRows] = await Promise.all([
    db.query.staff.findMany({ where: inArray(staff.id, teacherIds) }),
    db.query.subjects.findMany({ where: inArray(subjects.id, subjectIds) }),
    db.query.classes.findMany({ where: inArray(classes.id, classIds) }),
  ]);
  const teacherById = new Map(teacherRows.map((t) => [t.id, t]));
  const subjectById = new Map(subjectRows.map((s) => [s.id, s]));
  const classById = new Map(classRows.map((c) => [c.id, c]));

  return rows.map((r) => {
    const t = teacherById.get(r.teacherId);
    const s = subjectById.get(r.subjectId);
    const c = classById.get(r.classId);
    return {
      id: r.id,
      schoolId: r.schoolId,
      teacherId: r.teacherId,
      teacherName: t ? `${t.firstName} ${t.lastName}` : "",
      subjectId: r.subjectId,
      subjectName: s?.name ?? "",
      classId: r.classId,
      className: c?.name ?? "",
      title: r.title,
      description: r.description,
      fileUrl: r.fileUrl,
      dueDate: r.dueDate,
      status: (r.status as Assignment["status"]) ?? "draft",
      publishedAt: r.publishedAt?.toISOString() ?? null,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
    } satisfies Assignment;
  });
}

// Excludes soft-deleted rows from every read.
const NOT_DELETED = isNull(assignments.deletedAt);

export async function listAssignmentsForTeacherAction(teacherId: string): Promise<Assignment[]> {
  const rows = await db.query.assignments.findMany({
    where: and(eq(assignments.teacherId, teacherId), NOT_DELETED),
  });
  const list = await hydrateMany(rows);
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAssignmentAction(id: string): Promise<Assignment | null> {
  const row = await db.query.assignments.findFirst({
    where: and(eq(assignments.id, id), NOT_DELETED),
  });
  if (!row) return null;
  const [hydrated] = await hydrateMany([row]);
  return hydrated ?? null;
}

export async function listAssignmentsForStudentsAction(
  studentIds: string[]
): Promise<Assignment[]> {
  if (studentIds.length === 0) return [];
  const year = await getCurrentAcademicYear();

  // Find each student's current class.
  const enrollmentRows = await db
    .select({ classId: enrollments.classId })
    .from(enrollments)
    .where(
      and(
        inArray(enrollments.studentId, studentIds),
        eq(enrollments.academicYear, year),
        eq(enrollments.status, "Active")
      )
    );
  const classIds = Array.from(new Set(enrollmentRows.map((e) => e.classId)));
  if (classIds.length === 0) return [];

  const rows = await db.query.assignments.findMany({
    where: and(
      eq(assignments.status, "published"),
      inArray(assignments.classId, classIds),
      NOT_DELETED
    ),
  });
  const list = await hydrateMany(rows);
  return list.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

export async function createAssignmentAction(input: {
  teacherId: string;
  data: CreateAssignmentInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const schoolId = await getCurrentSchoolId();
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.data.classId) });
  if (!cls) return { success: false, error: "Class not found." };

  const id = `assign-${Date.now()}`;
  await db.insert(assignments).values({
    id,
    schoolId,
    teacherId: input.teacherId,
    subjectId: input.data.subjectId,
    classId: input.data.classId,
    title: input.data.title,
    description: input.data.description ?? null,
    fileUrl: input.data.fileUrl ?? null,
    dueDate: input.data.dueDate,
    status: "draft",
  });
  revalidatePath("/teacher/assignments");
  return { success: true, id };
}

export async function updateAssignmentAction(input: {
  id: string;
  teacherId: string;
  data: UpdateAssignmentInput;
}): Promise<ActionResult> {
  const row = await db.query.assignments.findFirst({ where: and(eq(assignments.id, input.id), NOT_DELETED) });
  if (!row) return { success: false, error: "Assignment not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only edit your own assignments." };
  }

  const patch: Partial<typeof assignments.$inferInsert> = { updatedAt: new Date() };
  if (input.data.subjectId !== undefined) patch.subjectId = input.data.subjectId;
  if (input.data.classId !== undefined) patch.classId = input.data.classId;
  if (input.data.title !== undefined) patch.title = input.data.title;
  if (input.data.description !== undefined) patch.description = input.data.description || null;
  if (input.data.fileUrl !== undefined) patch.fileUrl = input.data.fileUrl || null;
  if (input.data.dueDate !== undefined) patch.dueDate = input.data.dueDate;

  if (patch.classId) {
    const cls = await db.query.classes.findFirst({ where: eq(classes.id, patch.classId) });
    if (!cls) return { success: false, error: "Class not found." };
  }

  await db.update(assignments).set(patch).where(eq(assignments.id, input.id));
  revalidatePath("/teacher/assignments");
  return { success: true };
}

export async function publishAssignmentAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  const row = await db.query.assignments.findFirst({ where: and(eq(assignments.id, input.id), NOT_DELETED) });
  if (!row) return { success: false, error: "Assignment not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only publish your own assignments." };
  }
  if (row.status === "published") return { success: false, error: "Already published." };
  const now = new Date();
  await db
    .update(assignments)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(eq(assignments.id, input.id));

  // Notify parents of students in that class. The teacher chose "publish"
  // — they want parents to see this. Notif goes out once per parent.
  const due = row.dueDate
    ? ` Due ${new Date(row.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`
    : "";
  await notifyAudience(
    { type: "parentsOfClass", classId: row.classId },
    {
      kind: "assignment_created",
      title: "New assignment",
      body: `${row.title}.${due}`,
      link: `/parent/assignments`,
    }
  );

  revalidatePath("/teacher/assignments");
  return { success: true };
}

export async function unpublishAssignmentAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  const row = await db.query.assignments.findFirst({ where: and(eq(assignments.id, input.id), NOT_DELETED) });
  if (!row) return { success: false, error: "Assignment not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only unpublish your own assignments." };
  }
  await db
    .update(assignments)
    .set({ status: "draft", publishedAt: null, updatedAt: new Date() })
    .where(eq(assignments.id, input.id));
  revalidatePath("/teacher/assignments");
  return { success: true };
}

export async function deleteAssignmentAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  const row = await db.query.assignments.findFirst({ where: and(eq(assignments.id, input.id), NOT_DELETED) });
  if (!row) return { success: false, error: "Assignment not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only delete your own assignments." };
  }
  // Soft delete: row stays for the future admin Trash UI.
  await db
    .update(assignments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(assignments.id, input.id));
  revalidatePath("/teacher/assignments");
  return { success: true };
}
