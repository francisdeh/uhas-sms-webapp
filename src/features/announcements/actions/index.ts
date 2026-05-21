"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  announcements,
  staff,
  studentGuardians,
  enrollments,
  classes,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type {
  Announcement,
  CreateAnnouncementInput,
} from "@/features/announcements/types";
import { parseAudience } from "@/features/announcements/types";

type ActionResult = { success: true } | { success: false; error: string };

async function hydrateMany(rows: (typeof announcements.$inferSelect)[]): Promise<Announcement[]> {
  if (rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map((r) => r.createdById)));
  const authorRows = await db.query.staff.findMany({ where: inArray(staff.id, authorIds) });
  const authorById = new Map(authorRows.map((a) => [a.id, a]));
  return rows.map((r) => {
    const a = authorById.get(r.createdById);
    return {
      id: r.id,
      schoolId: r.schoolId,
      title: r.title,
      body: r.body,
      audience: r.audience,
      isCritical: r.isCritical ?? false,
      createdById: r.createdById,
      createdByName: a ? `${a.firstName} ${a.lastName}` : "",
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    } satisfies Announcement;
  });
}

export async function listAnnouncementsAction(): Promise<Announcement[]> {
  const schoolId = await getCurrentSchoolId();
  const rows = await db.query.announcements.findMany({
    where: eq(announcements.schoolId, schoolId),
  });
  const list = await hydrateMany(rows);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAnnouncementsForDeputyAction(
  deputyId: string
): Promise<Announcement[]> {
  const deputy = await db.query.staff.findFirst({ where: eq(staff.id, deputyId) });
  if (!deputy || deputy.systemRole !== "DeputyHead" || !deputy.division) return [];

  const list = await listAnnouncementsAction();
  return list.filter((a) => {
    const p = parseAudience(a.audience);
    if (p.kind === "all") return true;
    if (p.kind === "division") return p.division === deputy.division;
    return false;
  });
}

export async function listAnnouncementsForTeacherAction(
  teacherId: string
): Promise<Announcement[]> {
  const teacher = await db.query.staff.findFirst({ where: eq(staff.id, teacherId) });
  if (!teacher) return [];

  const list = await listAnnouncementsAction();
  return list.filter((a) => {
    const p = parseAudience(a.audience);
    if (p.kind === "all") return true;
    if (p.kind === "division") return teacher.division === p.division;
    return true;
  });
}

export async function listAnnouncementsForGuardianAction(
  guardianId: string
): Promise<Announcement[]> {
  const year = await getCurrentAcademicYear();
  // Children of this guardian
  const links = await db.query.studentGuardians.findMany({
    where: eq(studentGuardians.guardianId, guardianId),
  });
  const childIds = links.map((l) => l.studentId);
  if (childIds.length === 0) {
    return (await listAnnouncementsAction()).filter(
      (a) => parseAudience(a.audience).kind === "all"
    );
  }

  // Active enrollments for those children → division + classId
  const enrRows = await db
    .select({ classId: classes.id, division: classes.division })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(
      and(
        inArray(enrollments.studentId, childIds),
        eq(enrollments.academicYear, year),
        eq(enrollments.status, "Active")
      )
    );
  const childDivisions = new Set(enrRows.map((e) => e.division));
  const childClassIds = new Set(enrRows.map((e) => e.classId));

  const list = await listAnnouncementsAction();
  return list.filter((a) => {
    const p = parseAudience(a.audience);
    if (p.kind === "all") return true;
    if (p.kind === "division") return childDivisions.has(p.division);
    if (p.kind === "class") return childClassIds.has(p.classId);
    return false;
  });
}

export async function createAnnouncementAction(input: {
  authorId: string;
  data: CreateAnnouncementInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const schoolId = await getCurrentSchoolId();
  const author = await db.query.staff.findFirst({ where: eq(staff.id, input.authorId) });
  if (!author) return { success: false, error: "Author not found." };

  const parsed = parseAudience(input.data.audience);
  if (parsed.kind === "all" && author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can post school-wide announcements." };
  }
  if (parsed.kind === "division") {
    if (author.systemRole === "Admin") {
      // OK
    } else if (author.systemRole === "DeputyHead") {
      if (author.division !== parsed.division) {
        return { success: false, error: "You can only post to your own division." };
      }
    } else {
      return { success: false, error: "You are not allowed to post division announcements." };
    }
  }
  if (parsed.kind === "class" && author.systemRole !== "Admin") {
    return { success: false, error: "Only Admin can target a specific class." };
  }

  const id = `ann-${Date.now()}`;
  await db.insert(announcements).values({
    id,
    schoolId,
    title: input.data.title,
    body: input.data.body,
    audience: input.data.audience,
    isCritical: input.data.isCritical,
    createdById: author.id,
  });
  revalidatePath("/admin/announcements");
  revalidatePath("/deputy-head/announcements");
  revalidatePath("/teacher/announcements");
  revalidatePath("/parent/announcements");
  return { success: true, id };
}

export async function deleteAnnouncementAction(input: {
  id: string;
  authorId: string;
}): Promise<ActionResult> {
  const row = await db.query.announcements.findFirst({
    where: eq(announcements.id, input.id),
  });
  if (!row) return { success: false, error: "Announcement not found." };

  const author = await db.query.staff.findFirst({ where: eq(staff.id, input.authorId) });
  if (!author) return { success: false, error: "Author not found." };

  const isOwner = row.createdById === input.authorId;
  if (!isOwner && author.systemRole !== "Admin") {
    return { success: false, error: "You can only delete your own announcements." };
  }

  await db.delete(announcements).where(eq(announcements.id, input.id));
  revalidatePath("/admin/announcements");
  revalidatePath("/deputy-head/announcements");
  return { success: true };
}
