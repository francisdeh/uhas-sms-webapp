// Server-only — uses next/headers. Do NOT import this from a client component;
// import from './academic-year' for the constants/types instead.
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import {
  ACADEMIC_YEAR_COOKIE,
  DEFAULT_ACADEMIC_YEAR,
  isValidAcademicYear,
  type AcademicYear,
} from "./academic-year";

// Reads the cookie set by the AcademicYear switcher when present (lets users
// pin themselves to a past year for review purposes). Otherwise falls back
// to the school's current academic year from the `schools` row — which is
// what the Admin Settings → Calendar tab edits.
export async function getCurrentAcademicYear(): Promise<AcademicYear> {
  const c = await cookies();
  const cookieValue = c.get(ACADEMIC_YEAR_COOKIE)?.value;
  if (isValidAcademicYear(cookieValue)) return cookieValue;

  const schoolId = await getCurrentSchoolId();
  const row = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  if (isValidAcademicYear(row?.academicYear)) return row!.academicYear as AcademicYear;
  return DEFAULT_ACADEMIC_YEAR;
}
