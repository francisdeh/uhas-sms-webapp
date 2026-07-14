import { EXAM_TYPE, type ExamType, type GradingBand, type Score, type ScoreInput, type ScoreWeights } from "./types";

// Both bands and weights are required, not defaulted — the school's
// real values (GES defaults or a custom override) are always resolved
// server-side by `GET /school` (see `SchoolsService.get_resolved` in
// `apps/api/app/features/schools/service.py`), so every caller here
// already has a concrete value to pass. No frontend copy of "what the
// GES defaults actually are" to keep in sync with the backend's.
export function computeGrade(
  total: number,
  bands: GradingBand[]
): { grade: string; interpretation: string } {
  const band = bands.find((g) => total >= g.min && total <= g.max) ?? bands[bands.length - 1];
  return { grade: band.grade, interpretation: band.interpretation };
}

// End-of-term weighting defaults to 60% exam + 4x10% components, but a
// school can customize this via Settings > Grading (`weights` param) —
// mirrors the server-side computation in
// `apps/api/app/features/exams/compute.py`, which is what actually
// persists `totalScore` on save; this is only ever a live preview.
// Mid-term ranks on the raw exam score (100% weight) regardless.
// Returns null if no scores have been entered for this row.
export function computeTotalScore(
  examType: ExamType,
  components: Pick<ScoreInput, "cat1" | "cat2" | "projectWork" | "groupWork" | "examScore">,
  weights: ScoreWeights
): number | null {
  if (examType === EXAM_TYPE.MID_TERM) {
    return components.examScore == null ? null : Math.round(components.examScore);
  }

  const { cat1, cat2, projectWork, groupWork, examScore } = components;
  if (
    cat1 == null &&
    cat2 == null &&
    projectWork == null &&
    groupWork == null &&
    examScore == null
  ) {
    return null;
  }

  const weighted =
    ((cat1 ?? 0) * weights.cat1 +
      (cat2 ?? 0) * weights.cat2 +
      (projectWork ?? 0) * weights.projectWork +
      (groupWork ?? 0) * weights.groupWork +
      (examScore ?? 0) * weights.exam) /
    100;

  return Math.round(weighted);
}

// Assigns 1-based subjectPosition to each score in the list, ranking by totalScore desc.
// Equal totals share a position (1, 2, 2, 4 style).
export function assignSubjectPositions<T extends { totalScore: number | null }>(
  scores: T[]
): (T & { subjectPosition: number | null })[] {
  const ranked = [...scores].sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1));
  const positionMap = new Map<T, number>();
  let lastTotal: number | null = null;
  let lastPosition = 0;
  ranked.forEach((s, idx) => {
    if (s.totalScore == null) {
      positionMap.set(s, 0); // sentinel; we'll convert to null
      return;
    }
    if (s.totalScore !== lastTotal) {
      lastPosition = idx + 1;
      lastTotal = s.totalScore;
    }
    positionMap.set(s, lastPosition);
  });
  return scores.map((s) => ({
    ...s,
    subjectPosition: s.totalScore == null ? null : positionMap.get(s) ?? null,
  }));
}

// Aggregate (BECE-style): sum of grade numbers across the student's reported subjects.
// Lower is better. Returns null when no graded scores exist.
export function computeAggregate(scores: Pick<Score, "grade">[]): number | null {
  const graded = scores.filter((s) => s.grade != null);
  if (graded.length === 0) return null;
  return graded.reduce((sum, s) => sum + Number(s.grade), 0);
}

export function hasAnyComponentScore(
  components: Pick<ScoreInput, "cat1" | "cat2" | "projectWork" | "groupWork" | "examScore">
): boolean {
  return (
    components.cat1 != null ||
    components.cat2 != null ||
    components.projectWork != null ||
    components.groupWork != null ||
    components.examScore != null
  );
}
