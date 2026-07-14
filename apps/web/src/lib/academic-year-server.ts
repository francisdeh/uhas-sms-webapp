// Server-only — uses next/headers. Do NOT import this from a client component;
// import from './academic-year' for the constants/types instead.
import { cookies } from "next/headers";
import { getApi } from "@/lib/api/server";
import { nextAcademicYear } from "@/features/promotions/lib/academic-year";
import { ACADEMIC_YEAR_COOKIE, isValidAcademicYear, type AcademicYear } from "./academic-year";

// Reads the cookie set by the AcademicYear switcher when present (lets users
// pin themselves to a past year for review purposes). Otherwise falls back
// to the school's current academic year from the FastAPI /school endpoint —
// which is what the Admin Settings → Calendar tab edits.
//
// Trusts `school.academicYear` unconditionally once the cookie doesn't
// apply — it's server-validated data, not user input, so there's nothing
// to fall back to if it doesn't match some fixed list (there isn't one).
export async function getCurrentAcademicYear(): Promise<AcademicYear> {
  const c = await cookies();
  const cookieValue = c.get(ACADEMIC_YEAR_COOKIE)?.value;
  if (isValidAcademicYear(cookieValue)) return cookieValue;

  const api = await getApi();
  const school = await api.school.get();
  return school.academicYear;
}

/**
 * Selectable years for "create a new X" year pickers (classes, exams,
 * fee items) and the year-switcher's dropdown: every year with
 * `school_terms` data, plus the school's real current year and the year
 * immediately after it — so an Admin can always at least start
 * preparing next year, even before `school_terms` rows exist for it.
 *
 * Deliberately independent of the switcher cookie — the set of years you
 * can *create things in* doesn't change just because you're currently
 * *viewing* a past year.
 */
export async function getAcademicYearOptions(): Promise<AcademicYear[]> {
  const api = await getApi();
  const [school, termsResponse] = await Promise.all([api.school.get(), api.schoolTerms.list()]);
  const years = new Set(termsResponse.items.map((t) => t.academicYear));
  years.add(school.academicYear);
  years.add(nextAcademicYear(school.academicYear));
  return Array.from(years).sort();
}
