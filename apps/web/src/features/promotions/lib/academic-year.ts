// "2025/2026" → "2026/2027". Mirrors `next_academic_year` in
// apps/api/app/features/promotions/academic_year.py.
export function nextAcademicYear(current: string): string {
  const [start, end] = current.split("/").map(Number);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error(`Invalid academic year: ${current}`);
  }
  return `${start + 1}/${end + 1}`;
}
