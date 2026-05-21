// "2025/2026" → "2026/2027". Plain string return because the typed
// ACADEMIC_YEARS list in @/lib/academic-year is a fixed historical set.
export function nextAcademicYear(current: string): string {
  const [start, end] = current.split("/").map(Number);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(`Invalid academic year: ${current}`);
  }
  return `${start + 1}/${end + 1}`;
}
