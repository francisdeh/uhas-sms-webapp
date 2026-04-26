"use server";

import { mockStudents } from "@/lib/mock/students";
import { mockClasses } from "@/lib/mock/classes";
import { mockStudentGuardians } from "@/lib/mock/student-guardians";
import { mockGuardianProfiles } from "@/lib/mock/guardians";
import type {
  Student,
  CreateStudentInput,
  UpdateStudentInput,
  TransferStudentInput,
  ClassRecord,
  GuardianProfile,
} from "@/features/students/types";

type ActionResult = { success: true } | { success: false; error: string };

const DIVISION_WEIGHT: Record<"KG" | "Primary" | "JHS", number> = {
  KG: 0,
  Primary: 1,
  JHS: 2,
};

export async function listClassesAction(
  division?: "KG" | "Primary" | "JHS"
): Promise<ClassRecord[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    const filtered = division
      ? mockClasses.filter((c) => c.division === division)
      : mockClasses;
    return filtered;
  }
  return [];
}

export async function listStudentsAction(
  division?: "KG" | "Primary" | "JHS"
): Promise<Student[]> {
  if (process.env.USE_MOCK_DATA === "true") {
    const filtered = division
      ? mockStudents.filter((s) => s.division === division)
      : [...mockStudents];

    return filtered.sort((a, b) => {
      const divDiff = DIVISION_WEIGHT[a.division] - DIVISION_WEIGHT[b.division];
      if (divDiff !== 0) return divDiff;
      const classDiff = a.className.localeCompare(b.className);
      if (classDiff !== 0) return classDiff;
      return a.lastName.localeCompare(b.lastName);
    });
  }

  return [];
}

export async function createStudentAction(
  input: CreateStudentInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (process.env.USE_MOCK_DATA === "true") {
    const matchedClass = mockClasses.find((c) => c.id === input.classId);
    if (!matchedClass) {
      return { success: false, error: "Invalid classId: class not found." };
    }

    const year = new Date().getFullYear();
    const id = `UHAS-${year}-${String(mockStudents.length + 1).padStart(4, "0")}`;

    const newStudent: Student = {
      id,
      schoolId: "school-uhas-001",
      firstName: input.firstName,
      lastName: input.lastName,
      dob: input.dob,
      gender: input.gender,
      classId: input.classId,
      className: matchedClass.name,
      division: matchedClass.division,
      phone: input.phone,
      address: input.address,
      nationality: input.nationality,
      religion: input.religion,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    mockStudents.push(newStudent);

    return { success: true, id };
  }

  return { success: false, error: "DB not connected" };
}

export async function deactivateStudentAction(
  id: string
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const student = mockStudents.find((s) => s.id === id);
    if (!student) {
      return { success: false, error: "Student not found." };
    }
    student.isActive = false;
    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}

export async function reactivateStudentAction(
  id: string
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const student = mockStudents.find((s) => s.id === id);
    if (!student) {
      return { success: false, error: "Student not found." };
    }
    student.isActive = true;
    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}

export async function updateStudentAction(
  id: string,
  data: UpdateStudentInput
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const student = mockStudents.find((s) => s.id === id);
    if (!student) {
      return { success: false, error: "Student not found." };
    }

    if (data.firstName !== undefined) student.firstName = data.firstName;
    if (data.lastName !== undefined) student.lastName = data.lastName;
    if (data.dob !== undefined) student.dob = data.dob;
    if (data.gender !== undefined) student.gender = data.gender;
    if (data.phone !== undefined) student.phone = data.phone;
    if (data.address !== undefined) student.address = data.address;
    if (data.nationality !== undefined) student.nationality = data.nationality;
    if (data.religion !== undefined) student.religion = data.religion;

    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}

export async function transferStudentAction(
  id: string,
  data: TransferStudentInput
): Promise<ActionResult> {
  if (process.env.USE_MOCK_DATA === "true") {
    const newClass = mockClasses.find((c) => c.id === data.classId);
    if (!newClass) {
      return { success: false, error: "Class not found." };
    }

    const student = mockStudents.find((s) => s.id === id);
    if (!student) {
      return { success: false, error: "Student not found." };
    }

    if (student.classId === data.classId) {
      return { success: false, error: "Student is already in this class." };
    }

    student.classId = newClass.id;
    student.className = newClass.name;
    student.division = newClass.division;

    return { success: true };
  }

  return { success: false, error: "DB not connected" };
}

export async function getStudentGuardianAction(
  studentId: string
): Promise<GuardianProfile | null> {
  if (process.env.USE_MOCK_DATA !== "true") return null;

  const guardianId = Object.entries(mockStudentGuardians).find(([, ids]) =>
    ids.includes(studentId)
  )?.[0];

  if (!guardianId) return null;
  return mockGuardianProfiles[guardianId] ?? null;
}
