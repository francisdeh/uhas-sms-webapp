import { describe, expect, it } from "vitest";
import {
  computeGrade,
  computeTotalScore,
  assignSubjectPositions,
  computeAggregate,
  hasAnyComponentScore,
} from "./utils";

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
    expect(computeGrade(total)).toEqual({ grade, interpretation });
  });
});

describe("computeTotalScore", () => {
  it("MidTerm returns rounded examScore", () => {
    expect(computeTotalScore("MidTerm", { examScore: 75 })).toBe(75);
    expect(computeTotalScore("MidTerm", { examScore: 75.6 })).toBe(76);
  });

  it("MidTerm returns null when examScore missing", () => {
    expect(computeTotalScore("MidTerm", { examScore: null })).toBeNull();
  });

  it("EndOfTerm returns null when all components missing", () => {
    expect(
      computeTotalScore("EndOfTerm", {
        cat1: null,
        cat2: null,
        projectWork: null,
        groupWork: null,
        examScore: null,
      })
    ).toBeNull();
  });

  it("EndOfTerm weights: 4×10% CAT + 60% exam", () => {
    // (10 + 10 + 10 + 10) × 0.1 = 4, exam 50 × 0.6 = 30 → 34
    expect(
      computeTotalScore("EndOfTerm", {
        cat1: 10,
        cat2: 10,
        projectWork: 10,
        groupWork: 10,
        examScore: 50,
      })
    ).toBe(34);
  });

  it("EndOfTerm treats missing components as zero", () => {
    // exam alone, 100 × 0.6 = 60
    expect(
      computeTotalScore("EndOfTerm", {
        cat1: null,
        cat2: null,
        projectWork: null,
        groupWork: null,
        examScore: 100,
      })
    ).toBe(60);
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

describe("computeAggregate", () => {
  it("sums grade numbers across scored subjects", () => {
    expect(
      computeAggregate([{ grade: "1" }, { grade: "2" }, { grade: "3" }])
    ).toBe(6);
  });

  it("ignores subjects without a grade", () => {
    expect(
      computeAggregate([{ grade: "4" }, { grade: null }, { grade: "5" }])
    ).toBe(9);
  });

  it("returns null when nothing graded", () => {
    expect(computeAggregate([])).toBeNull();
    expect(computeAggregate([{ grade: null }])).toBeNull();
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
