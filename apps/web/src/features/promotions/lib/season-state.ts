import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { promotionSeasons, exams, schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";

export async function findOpenSeasonRow(): Promise<typeof promotionSeasons.$inferSelect | null> {
  const schoolId = await getCurrentSchoolId();
  const year = await getCurrentAcademicYearFromSchool(schoolId);
  const row = await db.query.promotionSeasons.findFirst({
    where: and(
      eq(promotionSeasons.schoolId, schoolId),
      eq(promotionSeasons.academicYear, year),
      eq(promotionSeasons.status, "open")
    ),
  });
  return row ?? null;
}

export async function findSeasonRow(
  academicYear: string
): Promise<typeof promotionSeasons.$inferSelect | null> {
  const schoolId = await getCurrentSchoolId();
  const row = await db.query.promotionSeasons.findFirst({
    where: and(
      eq(promotionSeasons.schoolId, schoolId),
      eq(promotionSeasons.academicYear, academicYear)
    ),
  });
  return row ?? null;
}

export async function hasPublishedTerm3EndOfTerm(academicYear: string): Promise<boolean> {
  const schoolId = await getCurrentSchoolId();
  const row = await db.query.exams.findFirst({
    where: and(
      eq(exams.schoolId, schoolId),
      eq(exams.academicYear, academicYear),
      eq(exams.term, 3),
      eq(exams.type, "EndOfTerm"),
      eq(exams.isPublished, true)
    ),
  });
  return !!row;
}

export async function getTerm3Exam(academicYear: string) {
  const schoolId = await getCurrentSchoolId();
  const row = await db.query.exams.findFirst({
    where: and(
      eq(exams.schoolId, schoolId),
      eq(exams.academicYear, academicYear),
      eq(exams.term, 3),
      eq(exams.type, "EndOfTerm"),
      eq(exams.isPublished, true)
    ),
  });
  return row ?? null;
}

async function getCurrentAcademicYearFromSchool(schoolId: string): Promise<string> {
  const school = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  return school?.academicYear ?? "2025/2026";
}
