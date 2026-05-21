"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { schemes, classes, subjects, staff } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type {
  Scheme,
  SchemeStatus,
  SchemeType,
  CreateSchemeInput,
  UpdateSchemeInput,
} from "@/features/schemes/types";
import type { Division } from "@/features/auth/types";

type ActionResult = { success: true } | { success: false; error: string };

async function hydrateMany(
  rows: (typeof schemes.$inferSelect)[]
): Promise<Scheme[]> {
  if (rows.length === 0) return [];
  const teacherIds = Array.from(new Set([
    ...rows.map((r) => r.teacherId),
    ...rows.map((r) => r.reviewedById).filter((id): id is string => !!id),
  ]));
  const subjectIds = Array.from(new Set(rows.map((r) => r.subjectId)));
  const classIds = Array.from(new Set(rows.map((r) => r.classId)));

  const [teacherRows, subjectRows, classRows] = await Promise.all([
    teacherIds.length === 0 ? [] : db.query.staff.findMany({ where: inArray(staff.id, teacherIds) }),
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
      type: r.type as SchemeType,
      term: r.term,
      academicYear: r.academicYear,
      title: r.title,
      fileUrl: r.fileUrl,
      content: r.content,
      status: (r.status as SchemeStatus) ?? "draft",
      reviewerComment: r.reviewerComment,
      reviewedById: r.reviewedById,
      reviewedByName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
    } satisfies Scheme;
  });
}

export async function listSchemesForTeacherAction(teacherId: string): Promise<Scheme[]> {
  const year = await getCurrentAcademicYear();
  const rows = await db.query.schemes.findMany({
    where: and(eq(schemes.teacherId, teacherId), eq(schemes.academicYear, year)),
  });
  const hydrated = await hydrateMany(rows);
  return hydrated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listSchemesAction(filter?: {
  status?: SchemeStatus | SchemeStatus[];
  type?: SchemeType;
}): Promise<Scheme[]> {
  const year = await getCurrentAcademicYear();
  const statusList = filter?.status
    ? Array.isArray(filter.status) ? filter.status : [filter.status]
    : null;

  const rows = await db.query.schemes.findMany({
    where: and(
      eq(schemes.academicYear, year),
      statusList && statusList.length > 0 ? inArray(schemes.status, statusList) : undefined,
      filter?.type ? eq(schemes.type, filter.type) : undefined
    ),
  });
  const hydrated = await hydrateMany(rows);
  return hydrated.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSchemeAction(id: string): Promise<Scheme | null> {
  const row = await db.query.schemes.findFirst({ where: eq(schemes.id, id) });
  if (!row) return null;
  const [hydrated] = await hydrateMany([row]);
  return hydrated ?? null;
}

export async function createSchemeAction(input: {
  teacherId: string;
  data: CreateSchemeInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const cls = await db.query.classes.findFirst({ where: eq(classes.id, input.data.classId) });
  if (!cls) return { success: false, error: "Class not found." };
  if (!input.data.fileUrl && !input.data.content) {
    return { success: false, error: "Provide either an upload URL or structured content." };
  }

  const id = `scheme-${Date.now()}`;
  await db.insert(schemes).values({
    id,
    schoolId,
    teacherId: input.teacherId,
    subjectId: input.data.subjectId,
    classId: input.data.classId,
    type: input.data.type,
    term: input.data.term,
    academicYear: year,
    title: input.data.title,
    fileUrl: input.data.fileUrl ?? null,
    content: input.data.content ?? null,
    status: "draft",
  });
  revalidatePath("/teacher/schemes");
  return { success: true, id };
}

export async function updateSchemeAction(input: {
  id: string;
  teacherId: string;
  data: UpdateSchemeInput;
}): Promise<ActionResult> {
  const row = await db.query.schemes.findFirst({ where: eq(schemes.id, input.id) });
  if (!row) return { success: false, error: "Scheme not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only edit your own schemes." };
  }
  if (row.status === "acknowledged") {
    return { success: false, error: "Acknowledged schemes are locked." };
  }

  const patch: Partial<typeof schemes.$inferInsert> = { updatedAt: new Date() };
  if (input.data.subjectId !== undefined) patch.subjectId = input.data.subjectId;
  if (input.data.classId !== undefined) patch.classId = input.data.classId;
  if (input.data.type !== undefined) patch.type = input.data.type;
  if (input.data.term !== undefined) patch.term = input.data.term;
  if (input.data.title !== undefined) patch.title = input.data.title;
  if (input.data.fileUrl !== undefined) patch.fileUrl = input.data.fileUrl || null;
  if (input.data.content !== undefined) patch.content = input.data.content || null;

  if (patch.classId) {
    const cls = await db.query.classes.findFirst({ where: eq(classes.id, patch.classId) });
    if (!cls) return { success: false, error: "Class not found." };
  }

  if (row.status === "submitted") {
    patch.status = "draft";
    patch.submittedAt = null;
  }

  await db.update(schemes).set(patch).where(eq(schemes.id, input.id));
  revalidatePath("/teacher/schemes");
  return { success: true };
}

export async function submitSchemeAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  const row = await db.query.schemes.findFirst({ where: eq(schemes.id, input.id) });
  if (!row) return { success: false, error: "Scheme not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only submit your own schemes." };
  }
  if (row.status !== "draft") return { success: false, error: "Only drafts can be submitted." };
  if (!row.fileUrl && !row.content) {
    return { success: false, error: "Add a file URL or content before submitting." };
  }
  const now = new Date();
  await db
    .update(schemes)
    .set({ status: "submitted", submittedAt: now, updatedAt: now })
    .where(eq(schemes.id, input.id));
  revalidatePath("/teacher/schemes");
  revalidatePath("/admin/schemes");
  return { success: true };
}

export async function acknowledgeSchemeAction(input: {
  id: string;
  reviewerId: string;
  comment?: string;
}): Promise<ActionResult> {
  const row = await db.query.schemes.findFirst({ where: eq(schemes.id, input.id) });
  if (!row) return { success: false, error: "Scheme not found." };

  const reviewer = await db.query.staff.findFirst({ where: eq(staff.id, input.reviewerId) });
  if (!reviewer || reviewer.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can acknowledge schemes." };
  }
  if (row.status !== "submitted") {
    return { success: false, error: "Scheme must be submitted to acknowledge." };
  }
  const now = new Date();
  await db
    .update(schemes)
    .set({
      status: "acknowledged",
      reviewerComment: input.comment?.trim() || null,
      reviewedById: reviewer.id,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(schemes.id, input.id));
  revalidatePath("/admin/schemes");
  return { success: true };
}

export async function deleteSchemeAction(input: {
  id: string;
  teacherId: string;
}): Promise<ActionResult> {
  const row = await db.query.schemes.findFirst({ where: eq(schemes.id, input.id) });
  if (!row) return { success: false, error: "Scheme not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only delete your own schemes." };
  }
  if (row.status === "acknowledged") {
    return { success: false, error: "Acknowledged schemes cannot be deleted." };
  }
  await db.delete(schemes).where(eq(schemes.id, input.id));
  revalidatePath("/teacher/schemes");
  return { success: true };
}
