"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  staff,
  students,
  guardians,
  studentGuardians,
  classSubjects,
  subjects,
  classTeachers,
  enrollments,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import type {
  Appointment,
  CreateAppointmentInput,
  RespondToAppointmentInput,
} from "@/features/appointments/types";

type ActionResult = { success: true } | { success: false; error: string };

async function hydrateMany(rows: (typeof appointments.$inferSelect)[]): Promise<Appointment[]> {
  if (rows.length === 0) return [];
  const guardianIds = Array.from(new Set(rows.map((r) => r.guardianId)));
  const studentIds = Array.from(new Set(rows.map((r) => r.studentId)));
  const teacherIds = Array.from(new Set(rows.map((r) => r.teacherId)));

  const [gRows, sRows, tRows] = await Promise.all([
    db.query.guardians.findMany({ where: inArray(guardians.id, guardianIds) }),
    db.query.students.findMany({ where: inArray(students.id, studentIds) }),
    db.query.staff.findMany({ where: inArray(staff.id, teacherIds) }),
  ]);
  const gById = new Map(gRows.map((g) => [g.id, g]));
  const sById = new Map(sRows.map((s) => [s.id, s]));
  const tById = new Map(tRows.map((t) => [t.id, t]));

  return rows.map((r) => {
    const g = gById.get(r.guardianId);
    const s = sById.get(r.studentId);
    const t = tById.get(r.teacherId);
    return {
      id: r.id,
      schoolId: r.schoolId,
      guardianId: r.guardianId,
      guardianName: g ? `${g.firstName} ${g.lastName}` : "",
      studentId: r.studentId,
      studentName: s ? `${s.firstName} ${s.lastName}` : "",
      teacherId: r.teacherId,
      teacherName: t ? `${t.firstName} ${t.lastName}` : "",
      preferredDate: r.preferredDate,
      preferredSlot: r.preferredSlot as Appointment["preferredSlot"],
      reason: r.reason,
      status: r.status as Appointment["status"],
      teacherResponse: r.teacherResponse,
      respondedAt: r.respondedAt?.toISOString() ?? null,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
    } satisfies Appointment;
  });
}

export async function listAppointmentsForGuardianAction(
  guardianId: string
): Promise<Appointment[]> {
  const rows = await db.query.appointments.findMany({
    where: eq(appointments.guardianId, guardianId),
  });
  const list = await hydrateMany(rows);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAppointmentsForTeacherAction(
  teacherId: string
): Promise<Appointment[]> {
  const rows = await db.query.appointments.findMany({
    where: eq(appointments.teacherId, teacherId),
  });
  const list = await hydrateMany(rows);
  return list.sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export async function listTeachersForStudentAction(
  studentId: string
): Promise<{ id: string; name: string; subjects: string[] }[]> {
  const year = await getCurrentAcademicYear();
  const enr = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentId, studentId),
      eq(enrollments.academicYear, year),
      eq(enrollments.status, "Active")
    ),
  });
  if (!enr) return [];

  // Class teachers for this class
  const ctRows = await db
    .select({
      staffId: classTeachers.staffId,
      firstName: staff.firstName,
      lastName: staff.lastName,
    })
    .from(classTeachers)
    .innerJoin(staff, eq(staff.id, classTeachers.staffId))
    .where(eq(classTeachers.classId, enr.classId));

  // Subject teachers for this class
  const csRows = await db
    .select({
      teacherId: classSubjects.teacherId,
      subjectName: subjects.name,
      firstName: staff.firstName,
      lastName: staff.lastName,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .leftJoin(staff, eq(staff.id, classSubjects.teacherId))
    .where(eq(classSubjects.classId, enr.classId));

  const byTeacher = new Map<string, { id: string; name: string; subjects: Set<string> }>();
  for (const r of ctRows) {
    const id = r.staffId;
    const entry = byTeacher.get(id) ?? {
      id,
      name: `${r.firstName} ${r.lastName}`,
      subjects: new Set<string>(),
    };
    entry.subjects.add("Class Teacher");
    byTeacher.set(id, entry);
  }
  for (const r of csRows) {
    if (!r.teacherId || !r.firstName) continue;
    const id = r.teacherId;
    const entry = byTeacher.get(id) ?? {
      id,
      name: `${r.firstName} ${r.lastName}`,
      subjects: new Set<string>(),
    };
    entry.subjects.add(r.subjectName);
    byTeacher.set(id, entry);
  }

  return Array.from(byTeacher.values())
    .map((t) => ({ id: t.id, name: t.name, subjects: [...t.subjects] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createAppointmentAction(input: {
  guardianId: string;
  data: CreateAppointmentInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const schoolId = await getCurrentSchoolId();
  // Validate guardian-student link
  const link = await db.query.studentGuardians.findFirst({
    where: and(
      eq(studentGuardians.guardianId, input.guardianId),
      eq(studentGuardians.studentId, input.data.studentId)
    ),
  });
  if (!link) {
    return { success: false, error: "That child is not linked to your account." };
  }

  const teachers = await listTeachersForStudentAction(input.data.studentId);
  if (!teachers.some((t) => t.id === input.data.teacherId)) {
    return { success: false, error: "That teacher does not teach your child." };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (input.data.preferredDate < today) {
    return { success: false, error: "Preferred date cannot be in the past." };
  }

  const id = `appt-${Date.now()}`;
  await db.insert(appointments).values({
    id,
    schoolId,
    guardianId: input.guardianId,
    studentId: input.data.studentId,
    teacherId: input.data.teacherId,
    preferredDate: input.data.preferredDate,
    preferredSlot: input.data.preferredSlot,
    reason: input.data.reason ?? null,
    status: "pending",
  });
  revalidatePath("/parent/appointments");
  revalidatePath("/teacher/appointments");
  return { success: true, id };
}

export async function respondToAppointmentAction(input: {
  id: string;
  teacherId: string;
  decision: RespondToAppointmentInput;
}): Promise<ActionResult> {
  const row = await db.query.appointments.findFirst({ where: eq(appointments.id, input.id) });
  if (!row) return { success: false, error: "Appointment not found." };
  if (row.teacherId !== input.teacherId) {
    return { success: false, error: "You can only respond to appointments addressed to you." };
  }
  if (row.status !== "pending") {
    return { success: false, error: "This appointment has already been actioned." };
  }
  if (input.decision.decision === "decline" && !input.decision.response?.trim()) {
    return { success: false, error: "Add a reason when declining." };
  }
  const now = new Date();
  await db
    .update(appointments)
    .set({
      status: input.decision.decision === "confirm" ? "confirmed" : "declined",
      teacherResponse: input.decision.response?.trim() || null,
      respondedAt: now,
      updatedAt: now,
    })
    .where(eq(appointments.id, input.id));
  revalidatePath("/teacher/appointments");
  revalidatePath("/parent/appointments");
  return { success: true };
}

export async function cancelAppointmentAction(input: {
  id: string;
  guardianId: string;
}): Promise<ActionResult> {
  const row = await db.query.appointments.findFirst({ where: eq(appointments.id, input.id) });
  if (!row) return { success: false, error: "Appointment not found." };
  if (row.guardianId !== input.guardianId) {
    return { success: false, error: "You can only cancel your own requests." };
  }
  if (row.status === "declined" || row.status === "cancelled") {
    return { success: false, error: "This appointment is already closed." };
  }
  await db
    .update(appointments)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(appointments.id, input.id));
  revalidatePath("/parent/appointments");
  return { success: true };
}
