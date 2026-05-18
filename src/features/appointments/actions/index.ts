"use server";

import { mockAppointments } from "@/lib/mock/appointments";
import { mockStudents } from "@/lib/mock/students";
import { mockStaff } from "@/lib/mock/staff";
import { mockGuardianProfiles } from "@/lib/mock/guardians";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockClassSubjects } from "@/lib/mock/class-subjects";
import { mockClasses } from "@/lib/mock/classes";
import type {
  Appointment,
  CreateAppointmentInput,
  RespondToAppointmentInput,
} from "@/features/appointments/types";

type ActionResult = { success: true } | { success: false; error: string };

const appointments = mockAppointments;

function lookup(guardianId: string, studentId: string, teacherId: string) {
  const guardian = mockGuardianProfiles[guardianId];
  const student = mockStudents.find((s) => s.id === studentId);
  const teacher = mockStaff.find((s) => s.id === teacherId);
  return {
    guardianName: guardian?.name ?? "",
    studentName: student ? `${student.firstName} ${student.lastName}` : "",
    teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : "",
  };
}

export async function listAppointmentsForGuardianAction(
  guardianId: string
): Promise<Appointment[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return [...appointments]
    .filter((a) => a.guardianId === guardianId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAppointmentsForTeacherAction(
  teacherId: string
): Promise<Appointment[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  return [...appointments]
    .filter((a) => a.teacherId === teacherId)
    .sort((a, b) => {
      // Pending first, then by recency
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

// List teachers that teach a given student (across all subjects)
// so the parent has a sensible picker.
export async function listTeachersForStudentAction(
  studentId: string
): Promise<{ id: string; name: string; subjects: string[] }[]> {
  if (process.env.USE_MOCK_DATA !== "true") return [];
  const student = mockStudents.find((s) => s.id === studentId);
  if (!student) return [];

  const classId = student.classId;
  const subjectAssignments = mockClassSubjects.filter(
    (cs) => cs.classId === classId && cs.teacherId
  );
  const classTeachers = mockClasses.find((c) => c.id === classId)?.classTeachers ?? [];

  const byTeacher: Record<string, { id: string; name: string; subjects: Set<string> }> = {};
  for (const ct of classTeachers) {
    byTeacher[ct.staffId] ??= { id: ct.staffId, name: ct.staffName, subjects: new Set() };
    byTeacher[ct.staffId].subjects.add("Class Teacher");
  }
  for (const cs of subjectAssignments) {
    if (!cs.teacherId || !cs.teacherName) continue;
    byTeacher[cs.teacherId] ??= { id: cs.teacherId, name: cs.teacherName, subjects: new Set() };
    byTeacher[cs.teacherId].subjects.add(cs.subjectName);
  }

  return Object.values(byTeacher)
    .map((t) => ({ id: t.id, name: t.name, subjects: [...t.subjects] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createAppointmentAction(input: {
  guardianId: string;
  data: CreateAppointmentInput;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };

  // Validate guardian-student link
  const linkedIds = mockStudentGuardians[input.guardianId] ?? [];
  if (!linkedIds.includes(input.data.studentId)) {
    return { success: false, error: "That child is not linked to your account." };
  }

  // Validate teacher actually teaches the student's class
  const teachers = await listTeachersForStudentAction(input.data.studentId);
  if (!teachers.some((t) => t.id === input.data.teacherId)) {
    return { success: false, error: "That teacher does not teach your child." };
  }

  // Disallow past dates
  const dateOnly = input.data.preferredDate;
  const today = new Date().toISOString().slice(0, 10);
  if (dateOnly < today) {
    return { success: false, error: "Preferred date cannot be in the past." };
  }

  const names = lookup(input.guardianId, input.data.studentId, input.data.teacherId);
  const id = `appt-${Date.now()}`;
  const now = new Date().toISOString();
  appointments.push({
    id,
    schoolId: "school-uhas-001",
    guardianId: input.guardianId,
    guardianName: names.guardianName,
    studentId: input.data.studentId,
    studentName: names.studentName,
    teacherId: input.data.teacherId,
    teacherName: names.teacherName,
    preferredDate: input.data.preferredDate,
    preferredSlot: input.data.preferredSlot,
    reason: input.data.reason ?? null,
    status: "pending",
    teacherResponse: null,
    respondedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { success: true, id };
}

export async function respondToAppointmentAction(input: {
  id: string;
  teacherId: string;
  decision: RespondToAppointmentInput;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const appt = appointments.find((a) => a.id === input.id);
  if (!appt) return { success: false, error: "Appointment not found." };
  if (appt.teacherId !== input.teacherId)
    return { success: false, error: "You can only respond to appointments addressed to you." };
  if (appt.status !== "pending")
    return { success: false, error: "This appointment has already been actioned." };
  if (input.decision.decision === "decline" && !input.decision.response?.trim()) {
    return { success: false, error: "Add a reason when declining." };
  }

  appt.status = input.decision.decision === "confirm" ? "confirmed" : "declined";
  appt.teacherResponse = input.decision.response?.trim() || null;
  appt.respondedAt = new Date().toISOString();
  appt.updatedAt = appt.respondedAt;
  return { success: true };
}

export async function cancelAppointmentAction(input: {
  id: string;
  guardianId: string;
}): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA !== "true") return { success: false, error: "DB not connected" };
  const appt = appointments.find((a) => a.id === input.id);
  if (!appt) return { success: false, error: "Appointment not found." };
  if (appt.guardianId !== input.guardianId)
    return { success: false, error: "You can only cancel your own requests." };
  if (appt.status === "declined" || appt.status === "cancelled") {
    return { success: false, error: "This appointment is already closed." };
  }
  appt.status = "cancelled";
  appt.updatedAt = new Date().toISOString();
  return { success: true };
}
