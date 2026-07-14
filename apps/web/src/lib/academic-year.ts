// Pure constants + types. Safe to import from both server and client.
// The server-only cookie reader + options fetcher live in
// `./academic-year-server.ts`.
//
// There used to be a hardcoded `ACADEMIC_YEARS` array here (a fixed set
// of 4 school years) enforced via `z.enum()` on every year picker in the
// app. Once the real school year advanced past the last entry, an Admin
// could no longer create a class or exam for the new year at all without
// a code change + deploy — see the 2026-07-14 academic-year-term-management
// design doc. Valid years are now derived at request time from
// `school_terms` + the school's real current year (see
// `getAcademicYearOptions` in `./academic-year-server.ts`), not a
// hardcoded list.

export type AcademicYear = string;

export const ACADEMIC_YEAR_COOKIE = "uhas_academic_year";

const ACADEMIC_YEAR_FORMAT = /^\d{4}\/\d{4}$/;

/** Format-only check ("YYYY/YYYY") — there's no fixed list of years to
 *  validate membership against anymore. Used to sanity-check the
 *  year-switcher cookie before trusting it. */
export function isValidAcademicYear(value: string | undefined): value is AcademicYear {
  return !!value && ACADEMIC_YEAR_FORMAT.test(value);
}
