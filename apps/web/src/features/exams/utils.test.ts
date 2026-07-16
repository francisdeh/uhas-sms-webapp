import { describe, expect, it } from "vitest";
import {
  computeGrade,
  computeTotalScore,
  assignSubjectPositions,
  hasAnyComponentScore,
} from "./utils";
import { EXAM_TYPE, type GradingBand, type ScoreWeights } from "./types";

// computeGrade/computeTotalScore take bands/weights as required params
// (the real values come from the school's settings, resolved
// server-side) — these fixtures are the GES standard, used here purely
// to exercise the maths, not as a "default" the functions fall back to.
const GES_BANDS: GradingBand[] = [
  { min: 90, max: 100, grade: "1", interpretation: "Highest" },
  { min: 80, max: 89, grade: "2", interpretation: "Higher" },
  { min: 70, max: 79, grade: "3", interpretation: "High" },
  { min: 60, max: 69, grade: "4", interpretation: "High Average" },
  { min: 55, max: 59, grade: "5", interpretation: "Average" },
  { min: 50, max: 54, grade: "6", interpretation: "Lower Average" },
  { min: 40, max: 49, grade: "7", interpretation: "Low" },
  { min: 35, max: 39, grade: "8", interpretation: "Lower" },
  { min: 0, max: 34, grade: "9", interpretation: "Lowest" },
];

const EVEN_WEIGHTS: ScoreWeights = { exam: 60, cat1: 10, cat2: 10, groupWork: 10, projectWork: 10 };

describe("computeGrade", () => {
  it.each([
    [100, "1", "Highest"],
    [90, "1", "Highest"],
    [89, "2", "Higher"],
    [80, "2", "Higher"],
    [79, "3", "High"],
    [70, "3", "High"],
    [69, "4", "High Average"],
    [60, "4", "High Average"],
    [59, "5", "Average"],
    [55, "5", "Average"],
    [54, "6", "Lower Average"],
    [50, "6", "Lower Average"],
    [49, "7", "Low"],
    [40, "7", "Low"],
    [39, "8", "Lower"],
    [35, "8", "Lower"],
    [34, "9", "Lowest"],
    [0, "9", "Lowest"],
  ])("%i → grade %s (%s)", (total, grade, interpretation) => {
    expect(computeGrade(total, GES_BANDS)).toEqual({ grade, interpretation });
  });
});

describe("computeTotalScore", () => {
  it("MidTerm returns rounded examScore", () => {
    expect(computeTotalScore(EXAM_TYPE.MID_TERM, { examScore: 75 }, EVEN_WEIGHTS)).toBe(75);
    expect(computeTotalScore(EXAM_TYPE.MID_TERM, { examScore: 75.6 }, EVEN_WEIGHTS)).toBe(76);
  });

  it("MidTerm returns null when examScore missing", () => {
    expect(computeTotalScore(EXAM_TYPE.MID_TERM, { examScore: null }, EVEN_WEIGHTS)).toBeNull();
  });

  it("EndOfTerm returns null when all components missing", () => {
    expect(
      computeTotalScore(
        EXAM_TYPE.END_OF_TERM,
        {
          cat1: null,
          cat2: null,
          projectWork: null,
          groupWork: null,
          examScore: null,
        },
        EVEN_WEIGHTS
      )
    ).toBeNull();
  });

  it("EndOfTerm weights: 4×10% CAT + 60% exam", () => {
    // (10 + 10 + 10 + 10) × 0.1 = 4, exam 50 × 0.6 = 30 → 34
    expect(
      computeTotalScore(
        EXAM_TYPE.END_OF_TERM,
        {
          cat1: 10,
          cat2: 10,
          projectWork: 10,
          groupWork: 10,
          examScore: 50,
        },
        EVEN_WEIGHTS
      )
    ).toBe(34);
  });

  it("EndOfTerm treats missing components as zero", () => {
    // exam alone, 100 × 0.6 = 60
    expect(
      computeTotalScore(
        EXAM_TYPE.END_OF_TERM,
        {
          cat1: null,
          cat2: null,
          projectWork: null,
          groupWork: null,
          examScore: 100,
        },
        EVEN_WEIGHTS
      )
    ).toBe(60);
  });

  it("respects custom weights (not just the GES default split)", () => {
    // exam 100% weight, everything else 0 → components ignored entirely
    const examOnly: ScoreWeights = { exam: 100, cat1: 0, cat2: 0, groupWork: 0, projectWork: 0 };
    expect(
      computeTotalScore(
        EXAM_TYPE.END_OF_TERM,
        { cat1: 100, cat2: 100, projectWork: 100, groupWork: 100, examScore: 42 },
        examOnly
      )
    ).toBe(42);
  });
});

describe("assignSubjectPositions", () => {
  it("ranks by totalScore descending", () => {
    const out = assignSubjectPositions([
      { totalScore: 70 },
      { totalScore: 90 },
      { totalScore: 50 },
    ]);
    expect(out.map((s) => s.subjectPosition)).toEqual([2, 1, 3]);
  });

  it("shares positions on ties (1, 2, 2, 4 style)", () => {
    const out = assignSubjectPositions([
      { totalScore: 90 },
      { totalScore: 80 },
      { totalScore: 80 },
      { totalScore: 70 },
    ]);
    expect(out.map((s) => s.subjectPosition)).toEqual([1, 2, 2, 4]);
  });

  it("returns null position for unscored entries", () => {
    const out = assignSubjectPositions([
      { totalScore: 60 },
      { totalScore: null },
      { totalScore: 70 },
    ]);
    expect(out[0].subjectPosition).toBe(2);
    expect(out[1].subjectPosition).toBeNull();
    expect(out[2].subjectPosition).toBe(1);
  });

  it("empty list returns empty array", () => {
    expect(assignSubjectPositions([])).toEqual([]);
  });
});

describe("hasAnyComponentScore", () => {
  it("true when any component is non-null", () => {
    expect(
      hasAnyComponentScore({
        cat1: null,
        cat2: null,
        projectWork: null,
        groupWork: 0,
        examScore: null,
      })
    ).toBe(true);
  });

  it("false when all components are null", () => {
    expect(
      hasAnyComponentScore({
        cat1: null,
        cat2: null,
        projectWork: null,
        groupWork: null,
        examScore: null,
      })
    ).toBe(false);
  });
});
