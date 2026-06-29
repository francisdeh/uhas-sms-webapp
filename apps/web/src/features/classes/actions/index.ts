"use server";
import type { ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { classes, subjects, classSubjects, classTeachers, staff } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getClassTeachersFor, toSchoolClass } from "@/features/classes/queries/get-class-by-id";
import type {
  SchoolClass,
  Subject,
  ClassSubject,
  Division,
  CreateClassInput,
  CreateSubjectInput,
  AssignTeacherInput,
  AddClassSubjectInput,
} from "@/features/classes/types";


const DIVISION_WEIGHT: Record<Division, number> = {
  KG: 0,
  "Lower Primary": 1,
  "Upper Primary": 2,
  JHS: 3,
};

export async function listClassesAction(
  division?: Division,
  academicYear?: string
): Promise<SchoolClass[]> {
  const schoolId = await getCurrentSchoolId();
  const year = academicYear ?? (await getCurrentAcademicYear());

  const rows = await db.query.classes.findMany({
    where: and(
      eq(classes.schoolId, schoolId),
      eq(classes.academicYear, year),
      division ? eq(classes.division, division) : undefined
    ),
    orderBy: [asc(classes.name)],
  });
  const teachers = await getClassTeachersFor(rows.map((c) => c.id));

  return rows
    .map((c) => toSchoolClass(c, teachers.get(c.id) ?? []))
    .sort((a, b) => {
      const divDiff = DIVISION_WEIGHT[a.division] - DIVISION_WEIGHT[b.division];
      if (divDiff !== 0) return divDiff;
      return a.name.localeCompare(b.name);
    });
}

export async function createClassAction(
  input: CreateClassInput
): Promise<ActionResult<{ id: string }>> {
  const schoolId = await getCurrentSchoolId();
  const duplicate = await db.query.classes.findFirst({
    where: and(
      eq(classes.schoolId, schoolId),
      eq(classes.name, input.name),
      eq(classes.academicYear, input.academicYear)
    ),
  });
  if (duplicate) {
    return { success: false, error: "A class with this name already exists for this academic year." };
  }
  // Slug is human-readable + URL-routable; uuid PK is DB-generated.
  const slug = `class-${input.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const [inserted] = await db
    .insert(classes)
    .values({
      slug,
      schoolId,
      name: input.name,
      division: input.division,
      academicYear: input.academicYear,
    })
    .returning();
  revalidatePath("/admin/classes");
  return { success: true, id: inserted.id };
}

export async function listSubjectsAction(
  division?: Division | null
): Promise<Subject[]> {
  const schoolId = await getCurrentSchoolId();
  const rows = await db.query.subjects.findMany({
    where: and(
      eq(subjects.schoolId, schoolId),
      division === undefined
        ? undefined
        : division === null
          ? isNull(subjects.division)
          : or(eq(subjects.division, division), isNull(subjects.division))
    ),
    orderBy: [asc(subjects.name)],
  });
  return rows
    .map(
      (s) =>
        ({
          id: s.id,
          schoolId: s.schoolId,
          name: s.name,
          division: (s.division as Division | null) ?? null,
          category: (s.category as "Core" | "Elective") ?? "Core",
        }) satisfies Subject
    )
    .sort((a, b) => {
      const aWeight = a.division !== null ? DIVISION_WEIGHT[a.division] : 4;
      const bWeight = b.division !== null ? DIVISION_WEIGHT[b.division] : 4;
      const divDiff = aWeight - bWeight;
      if (divDiff !== 0) return divDiff;
      return a.name.localeCompare(b.name);
    });
}

export async function createSubjectAction(
  input: CreateSubjectInput
): Promise<ActionResult<{ id: string }>> {
  const schoolId = await getCurrentSchoolId();
  const duplicate = await db.query.subjects.findFirst({
    where: and(
      eq(subjects.schoolId, schoolId),
      eq(subjects.name, input.name),
      input.division === null ? isNull(subjects.division) : eq(subjects.division, input.division)
    ),
  });
  if (duplicate) {
    return { success: false, error: "A subject with this name already exists for this division." };
  }
  const slug = `sub-${Date.now()}`;
  const [inserted] = await db
    .insert(subjects)
    .values({
      slug,
      schoolId,
      name: input.name,
      division: input.division,
      category: input.category,
    })
    .returning();
  revalidatePath("/admin/subjects");
  return { success: true, id: inserted.id };
}

async function joinClassSubjects(
  whereExpr: ReturnType<typeof eq> | undefined
): Promise<ClassSubject[]> {
  const rows = await db
    .select({
      classId: classSubjects.classId,
      subjectId: classSubjects.subjectId,
      subjectName: subjects.name,
      teacherId: classSubjects.teacherId,
      teacherFirst: staff.firstName,
      teacherLast: staff.lastName,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId))
    .leftJoin(staff, eq(staff.id, classSubjects.teacherId))
    .where(whereExpr ?? sql`true`);

  return rows.map((r) => ({
    classId: r.classId,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
    teacherId: r.teacherId,
    teacherName: r.teacherFirst ? `${r.teacherFirst} ${r.teacherLast}` : null,
  }));
}

export async function listClassSubjectsAction(classId: string): Promise<ClassSubject[]> {
  const list = await joinClassSubjects(eq(classSubjects.classId, classId));
  return list.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export async function listClassSubjectsBySubjectAction(subjectId: string): Promise<ClassSubject[]> {
  return joinClassSubjects(eq(classSubjects.subjectId, subjectId));
}

export async function listClassSubjectsByTeacherAction(teacherId: string): Promise<ClassSubject[]> {
  return joinClassSubjects(eq(classSubjects.teacherId, teacherId));
}

export async function addClassSubjectAction(
  classId: string,
  input: AddClassSubjectInput
): Promise<ActionResult> {
  const existing = await db.query.classSubjects.findFirst({
    where: and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, input.subjectId)),
  });
  if (existing) return { success: false, error: "Subject already linked to this class." };

  const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, input.subjectId) });
  if (!subject) return { success: false, error: "Subject not found." };

  await db.insert(classSubjects).values({
    classId,
    subjectId: input.subjectId,
    teacherId: null,
  });
  revalidatePath(`/admin/classes/${classId}`);
  return { success: true };
}

export async function assignTeacherAction(
  classId: string,
  subjectId: string,
  input: AssignTeacherInput
): Promise<ActionResult> {
  const existing = await db.query.classSubjects.findFirst({
    where: and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)),
  });
  if (!existing) return { success: false, error: "Assignment not found." };

  if (input.teacherId) {
    const teacher = await db.query.staff.findFirst({ where: eq(staff.id, input.teacherId) });
    if (!teacher) return { success: false, error: "Teacher not found." };
  }

  await db
    .update(classSubjects)
    .set({ teacherId: input.teacherId })
    .where(and(eq(classSubjects.classId, classId), eq(classSubjects.subjectId, subjectId)));
  revalidatePath(`/admin/classes/${classId}`);
  return { success: true };
}

export async function assignClassTeacherAction(
  classId: string,
  input: { teacherId: string | null }
): Promise<ActionResult> {
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!cls) return { success: false, error: "Class not found." };

  await db.transaction(async (tx) => {
    await tx.delete(classTeachers).where(eq(classTeachers.classId, classId));
    if (input.teacherId) {
      const teacher = await tx.query.staff.findFirst({ where: eq(staff.id, input.teacherId) });
      if (!teacher) throw new Error("Teacher not found.");
      await tx.insert(classTeachers).values({
        classId,
        staffId: input.teacherId,
        isPrimary: true,
      });
    }
  });
  revalidatePath(`/admin/classes/${classId}`);
  return { success: true };
}

export async function addClassTeacherAction(
  classId: string,
  input: { staffId: string; isPrimary?: boolean }
): Promise<ActionResult> {
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!cls) return { success: false, error: "Class not found." };

  const existing = await db.query.classTeachers.findFirst({
    where: and(eq(classTeachers.classId, classId), eq(classTeachers.staffId, input.staffId)),
  });
  if (existing) return { success: false, error: "Staff already a class teacher for this class." };

  const teacher = await db.query.staff.findFirst({ where: eq(staff.id, input.staffId) });
  if (!teacher) return { success: false, error: "Teacher not found." };

  await db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(classTeachers)
        .set({ isPrimary: false })
        .where(eq(classTeachers.classId, classId));
    }
    const otherCount = await tx
      .select({ n: sql<number>`count(*)` })
      .from(classTeachers)
      .where(eq(classTeachers.classId, classId));
    const isFirst = Number(otherCount[0]?.n ?? 0) === 0;
    await tx.insert(classTeachers).values({
      classId,
      staffId: input.staffId,
      isPrimary: input.isPrimary ?? isFirst,
    });
  });
  revalidatePath(`/admin/classes/${classId}`);
  return { success: true };
}

export async function removeClassTeacherAction(
  classId: string,
  staffId: string
): Promise<ActionResult> {
  const cls = await db.query.classes.findFirst({ where: eq(classes.id, classId) });
  if (!cls) return { success: false, error: "Class not found." };

  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(classTeachers)
      .where(and(eq(classTeachers.classId, classId), eq(classTeachers.staffId, staffId)))
      .returning();
    if (removed.length === 0) return;

    // If we removed the primary, promote whichever remains to primary.
    const remaining = await tx.query.classTeachers.findMany({
      where: eq(classTeachers.classId, classId),
    });
    const hasPrimary = remaining.some((t) => t.isPrimary);
    if (remaining.length > 0 && !hasPrimary) {
      await tx
        .update(classTeachers)
        .set({ isPrimary: true })
        .where(
          and(
            eq(classTeachers.classId, classId),
            eq(classTeachers.staffId, remaining[0].staffId)
          )
        );
    }
  });
  revalidatePath(`/admin/classes/${classId}`);
  return { success: true };
}
