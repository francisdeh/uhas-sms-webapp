import type { ExamType, Score, ScoreInput } from "./types";

export const GES_GRADES: { min: number; max: number; grade: string; interpretation: string }[] = [
  { min: 90, max: 100, grade: "1", interpretation: "Highest" },
  { min: 80, max: 89,  grade: "2", interpretation: "Higher" },
  { min: 70, max: 79,  grade: "3", interpretation: "High" },
  { min: 60, max: 69,  grade: "4", interpretation: "High Average" },
  { min: 55, max: 59,  grade: "5", interpretation: "Average" },
  { min: 50, max: 54,  grade: "6", interpretation: "Lower Average" },
  { min: 40, max: 49,  grade: "7", interpretation: "Low" },
  { min: 35, max: 39,  grade: "8", interpretation: "Lower" },
  { min: 0,  max: 34,  grade: "9", interpretation: "Lowest" },
];

export function computeGrade(total: number): { grade: string; interpretation: string } {
  const band =
    GES_GRADES.find((g) => total >= g.min && total <= g.max) ??
    GES_GRADES[GES_GRADES.length - 1];
  return { grade: band.grade, interpretation: band.interpretation };
}

// Placeholder end-of-term weighting: 60% exam + 4x10% components.
// Mid-term ranks on the raw exam score (100% weight).
// Returns null if no scores have been entered for this row.
export function computeTotalScore(
  examType: ExamType,
  components: Pick<ScoreInput, "cat1" | "cat2" | "projectWork" | "groupWork" | "examScore">
): number | null {
  if (examType === "MidTerm") {
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
    (cat1 ?? 0) * 0.1 +
    (cat2 ?? 0) * 0.1 +
    (projectWork ?? 0) * 0.1 +
    (groupWork ?? 0) * 0.1 +
    (examScore ?? 0) * 0.6;

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
