// Pure constants + types. Safe to import from both server and client.
// The server-only cookie reader lives in `./academic-year-server.ts`.

export const ACADEMIC_YEARS = ["2025/2026", "2024/2025", "2023/2024", "2022/2023"] as const;
export type AcademicYear = (typeof ACADEMIC_YEARS)[number];

export const DEFAULT_ACADEMIC_YEAR: AcademicYear = "2025/2026";
export const ACADEMIC_YEAR_COOKIE = "uhas_academic_year";

export function isValidAcademicYear(value: string | undefined): value is AcademicYear {
  return !!value && (ACADEMIC_YEARS as readonly string[]).includes(value);
}
