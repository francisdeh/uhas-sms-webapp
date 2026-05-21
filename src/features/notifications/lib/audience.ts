import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  staff,
  classes,
  enrollments,
  studentGuardians,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type { AudienceSpec } from "@/features/notifications/types";

// Resolves an AudienceSpec to a deduped list of active user IDs (Firebase UIDs).
// Deactivated users (`users.isActive = false`) are filtered out — they don't
// receive notifications.
export async function resolveAudience(spec: AudienceSpec): Promise<string[]> {
  const schoolId = await getCurrentSchoolId();
  const ids = await resolve(spec, schoolId);
  if (ids.length === 0) return [];

  // Filter out deactivated + dedupe in one pass.
  const active = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.schoolId, schoolId),
        eq(users.isActive, true),
        inArray(users.id, ids)
      )
    );
  return Array.from(new Set(active.map((u) => u.id)));
}

async function resolve(spec: AudienceSpec, schoolId: string): Promise<string[]> {
  switch (spec.type) {
    case "user":
      return [spec.userId];

    case "users":
      return spec.userIds;

    case "staff": {
      const row = await db.query.users.findFirst({
        where: and(eq(users.schoolId, schoolId), eq(users.linkedId, spec.staffId)),
      });
      return row ? [row.id] : [];
    }

    case "staffByDivision": {
      const staffRows = await db.query.staff.findMany({
        where: and(eq(staff.schoolId, schoolId), eq(staff.division, spec.division)),
      });
      const ids = staffRows
        .filter((s) =>
          !spec.roles || (s.systemRole && spec.roles.includes(s.systemRole as "Admin" | "DeputyHead" | "Teacher"))
        )
        .map((s) => s.id);
      if (ids.length === 0) return [];
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.schoolId, schoolId), inArray(users.linkedId, ids)));
      return userRows.map((u) => u.id);
    }

    case "unitHeadOfDivision": {
      const staffRows = await db.query.staff.findMany({
        where: and(
          eq(staff.schoolId, schoolId),
          eq(staff.unitHeadOf, spec.division)
        ),
      });
      const ids = staffRows.map((s) => s.id);
      if (ids.length === 0) return [];
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.schoolId, schoolId), inArray(users.linkedId, ids)));
      return userRows.map((u) => u.id);
    }

    case "allTeachers": {
      const rows = await db.query.users.findMany({
        where: and(eq(users.schoolId, schoolId), eq(users.role, "Teacher")),
      });
      return rows.map((u) => u.id);
    }

    case "allAdmins": {
      const rows = await db.query.users.findMany({
        where: and(eq(users.schoolId, schoolId), eq(users.role, "Admin")),
      });
      return rows.map((u) => u.id);
    }

    case "parentsOfStudents": {
      if (spec.studentIds.length === 0) return [];
      const links = await db.query.studentGuardians.findMany({
        where: inArray(studentGuardians.studentId, spec.studentIds),
      });
      const guardianIds = Array.from(new Set(links.map((l) => l.guardianId)));
      if (guardianIds.length === 0) return [];
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.schoolId, schoolId), inArray(users.linkedId, guardianIds)));
      return userRows.map((u) => u.id);
    }

    case "parentsOfClass": {
      const year = await getCurrentAcademicYear();
      const studentRows = await db.query.enrollments.findMany({
        where: and(
          eq(enrollments.classId, spec.classId),
          eq(enrollments.academicYear, year),
          eq(enrollments.status, "Active")
        ),
      });
      const studentIds = studentRows.map((e) => e.studentId);
      if (studentIds.length === 0) return [];
      return resolve({ type: "parentsOfStudents", studentIds }, schoolId);
    }

    case "parentsInDivision": {
      const year = await getCurrentAcademicYear();
      const classRows = await db.query.classes.findMany({
        where: and(
          eq(classes.schoolId, schoolId),
          eq(classes.division, spec.division),
          eq(classes.academicYear, year)
        ),
      });
      const classIds = classRows.map((c) => c.id);
      if (classIds.length === 0) return [];
      const enrollmentRows = await db.query.enrollments.findMany({
        where: and(
          inArray(enrollments.classId, classIds),
          eq(enrollments.academicYear, year),
          eq(enrollments.status, "Active")
        ),
      });
      const studentIds = Array.from(new Set(enrollmentRows.map((e) => e.studentId)));
      if (studentIds.length === 0) return [];
      return resolve({ type: "parentsOfStudents", studentIds }, schoolId);
    }

    case "allParents": {
      const rows = await db.query.users.findMany({
        where: and(eq(users.schoolId, schoolId), eq(users.role, "Parent")),
      });
      return rows.map((u) => u.id);
    }

    case "schoolWide": {
      const rows = await db.query.users.findMany({
        where: eq(users.schoolId, schoolId),
      });
      return rows.map((u) => u.id);
    }
  }
}
