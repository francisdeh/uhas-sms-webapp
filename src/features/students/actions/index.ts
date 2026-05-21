"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import {
  students,
  classes,
  enrollments,
  studentGuardians,
  guardians,
} from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { writeAuditLog } from "@/lib/audit-log";
import { getActiveEnrollmentMap } from "@/features/students/queries/get-active-enrollment";
import type {
  Student,
  CreateStudentInput,
  UpdateStudentInput,
  TransferStudentInput,
  ClassRecord,
  GuardianProfile,
} from "@/features/students/types";
import type { Division } from "@/features/auth/types";

type ActionResult = { success: true } | { success: false; error: string };

const DIVISION_WEIGHT: Record<Division, number> = {
  KG: 0,
  "Lower Primary": 1,
  "Upper Primary": 2,
  JHS: 3,
};

export async function listClassesAction(
  division?: Division
): Promise<ClassRecord[]> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();
  const rows = await db.query.classes.findMany({
    where: and(
      eq(classes.schoolId, schoolId),
      eq(classes.academicYear, year),
      division ? eq(classes.division, division) : undefined
    ),
    orderBy: [asc(classes.name)],
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    division: c.division as Division,
  }));
}

export async function listStudentsAction(division?: Division): Promise<Student[]> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const rows = await db.query.students.findMany({
    where: eq(students.schoolId, schoolId),
  });
  const enrollmentMap = await getActiveEnrollmentMap(
    rows.map((s) => s.id),
    year
  );

  const list: Student[] = rows
    .map((s) => {
      const enr = enrollmentMap.get(s.id);
      return {
        id: s.id,
        schoolId: s.schoolId,
        firstName: s.firstName,
        middleName: s.middleName ?? undefined,
        lastName: s.lastName,
        dob: s.dob ?? "",
        gender: (s.gender as "Male" | "Female") ?? "Male",
        classId: enr?.classId ?? "",
        className: enr?.className ?? "",
        division: enr?.division ?? "KG",
        phone: s.phone ?? undefined,
        address: s.address ?? undefined,
        nationality: s.nationality ?? undefined,
        religion: s.religion ?? undefined,
        photoUrl: s.photoUrl ?? undefined,
        isActive: s.isActive ?? true,
        createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
      };
    })
    .filter((s) => !division || s.division === division)
    .sort((a, b) => {
      const divDiff = DIVISION_WEIGHT[a.division] - DIVISION_WEIGHT[b.division];
      if (divDiff !== 0) return divDiff;
      const classDiff = a.className.localeCompare(b.className);
      if (classDiff !== 0) return classDiff;
      return a.lastName.localeCompare(b.lastName);
    });

  return list;
}

export async function createStudentAction(
  input: CreateStudentInput
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const matchedClass = await db.query.classes.findFirst({
    where: and(eq(classes.id, input.classId), eq(classes.schoolId, schoolId)),
  });
  if (!matchedClass) {
    return { success: false, error: "Invalid classId: class not found." };
  }

  // Generate next sequence-based ID: UHAS-{YEAR}-{NNNN}
  const yearShort = new Date().getFullYear();
  const prefix = `UHAS-${yearShort}-`;
  const last = await db.query.students.findFirst({
    where: and(eq(students.schoolId, schoolId), like(students.id, `${prefix}%`)),
    orderBy: [desc(students.id)],
  });
  const nextSeq = last ? Number(last.id.slice(prefix.length)) + 1 : 1;
  const id = `${prefix}${String(nextSeq).padStart(4, "0")}`;

  await db.transaction(async (tx) => {
    await tx.insert(students).values({
      id,
      schoolId,
      firstName: input.firstName,
      middleName: input.middleName ?? null,
      lastName: input.lastName,
      dob: input.dob,
      gender: input.gender,
      phone: input.phone ?? null,
      address: input.address ?? null,
      nationality: input.nationality ?? null,
      religion: input.religion ?? null,
      photoUrl: input.photoUrl ?? null,
      isActive: true,
    });
    await tx.insert(enrollments).values({
      id: `enr-${id}-${year.replace("/", "-")}`,
      studentId: id,
      classId: input.classId,
      academicYear: year,
      status: "Active",
      enrollmentDate: new Date().toISOString().slice(0, 10),
    });
  });

  revalidatePath("/admin/students");
  revalidatePath("/deputy-head/students");
  return { success: true, id };
}

export async function deactivateStudentAction(id: string): Promise<ActionResult> {
  const schoolId = await getCurrentSchoolId();
  const result = await db
    .update(students)
    .set({ isActive: false })
    .where(and(eq(students.id, id), eq(students.schoolId, schoolId)));
  if ((result.rowCount ?? 0) === 0) return { success: false, error: "Student not found." };
  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  return { success: true };
}

export async function reactivateStudentAction(id: string): Promise<ActionResult> {
  const schoolId = await getCurrentSchoolId();
  const result = await db
    .update(students)
    .set({ isActive: true })
    .where(and(eq(students.id, id), eq(students.schoolId, schoolId)));
  if ((result.rowCount ?? 0) === 0) return { success: false, error: "Student not found." };
  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  return { success: true };
}

export async function updateStudentAction(
  id: string,
  data: UpdateStudentInput
): Promise<ActionResult> {
  const schoolId = await getCurrentSchoolId();
  const cookieStore = await cookies();
  const actor = cookieStore.get("session_uid")?.value ?? "system";

  const before = await db.query.students.findFirst({
    where: and(eq(students.id, id), eq(students.schoolId, schoolId)),
  });
  if (!before) return { success: false, error: "Student not found." };

  const patch: Partial<typeof students.$inferInsert> = {};
  if (data.firstName !== undefined) patch.firstName = data.firstName;
  if (data.middleName !== undefined) patch.middleName = data.middleName;
  if (data.lastName !== undefined) patch.lastName = data.lastName;
  if (data.dob !== undefined) patch.dob = data.dob;
  if (data.gender !== undefined) patch.gender = data.gender;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.address !== undefined) patch.address = data.address;
  if (data.nationality !== undefined) patch.nationality = data.nationality;
  if (data.religion !== undefined) patch.religion = data.religion;
  if (data.photoUrl !== undefined) patch.photoUrl = data.photoUrl;

  if (Object.keys(patch).length === 0) return { success: true };

  await db.update(students).set(patch).where(eq(students.id, id));

  await writeAuditLog(db, {
    userId: actor,
    action: "STUDENT_EDIT",
    targetTable: "students",
    targetId: id,
    before,
    after: patch,
  });

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  return { success: true };
}

export async function transferStudentAction(
  id: string,
  data: TransferStudentInput
): Promise<ActionResult> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYear();

  const newClass = await db.query.classes.findFirst({
    where: and(eq(classes.id, data.classId), eq(classes.schoolId, schoolId)),
  });
  if (!newClass) return { success: false, error: "Class not found." };

  const student = await db.query.students.findFirst({
    where: and(eq(students.id, id), eq(students.schoolId, schoolId)),
  });
  if (!student) return { success: false, error: "Student not found." };

  const current = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.studentId, id),
      eq(enrollments.academicYear, year),
      eq(enrollments.status, "Active")
    ),
  });
  if (current?.classId === data.classId) {
    return { success: false, error: "Student is already in this class." };
  }

  await db.transaction(async (tx) => {
    if (current) {
      await tx
        .update(enrollments)
        .set({ status: "Completed" })
        .where(eq(enrollments.id, current.id));
    }
    await tx.insert(enrollments).values({
      id: `enr-${id}-${year.replace("/", "-")}-${Date.now()}`,
      studentId: id,
      classId: data.classId,
      academicYear: year,
      status: "Active",
      enrollmentDate: new Date().toISOString().slice(0, 10),
    });
  });

  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  return { success: true };
}

export async function getStudentGuardianAction(
  studentId: string
): Promise<GuardianProfile | null> {
  const row = await db
    .select({
      id: guardians.id,
      firstName: guardians.firstName,
      lastName: guardians.lastName,
      phone: guardians.phone,
      email: guardians.email,
      relation: studentGuardians.relation,
    })
    .from(studentGuardians)
    .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
    .where(eq(studentGuardians.studentId, studentId))
    .limit(1);
  if (row.length === 0) return null;
  const g = row[0];
  return {
    id: g.id,
    name: `${g.firstName} ${g.lastName}`.trim(),
    relationship: g.relation ?? "Guardian",
    phone: g.phone ?? undefined,
    email: g.email ?? undefined,
  };
}
