// Server-only — uses next/headers. Do NOT import this from a client component;
// import from './academic-year' for the constants/types instead.
import { cookies } from "next/headers";
import {
  ACADEMIC_YEAR_COOKIE,
  DEFAULT_ACADEMIC_YEAR,
  isValidAcademicYear,
  type AcademicYear,
} from "./academic-year";

// Reads the cookie set by the AcademicYear switcher. Server-only because it
// uses next/headers; pulling this into a client bundle is a build error.
// Falls back to DEFAULT_ACADEMIC_YEAR (the school's current year) when unset.
export async function getCurrentAcademicYear(): Promise<AcademicYear> {
  const c = await cookies();
  const value = c.get(ACADEMIC_YEAR_COOKIE)?.value;
  return isValidAcademicYear(value) ? value : DEFAULT_ACADEMIC_YEAR;
}
