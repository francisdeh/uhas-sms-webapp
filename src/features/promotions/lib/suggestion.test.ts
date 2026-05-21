import { describe, expect, it } from "vitest";
import { computePromotionSuggestion } from "./suggestion";
import type { Subject } from "@/features/classes/types";
import type { Score } from "@/features/exams/types";

function makeSubject(id: string, name: string): Subject {
  return {
    id,
    schoolId: "school-uhas-001",
    name,
    division: "Upper Primary",
    category: "Core",
  };
}

function makeScore(subjectId: string, totalScore: number | null): Score {
  return {
    id: `score-${subjectId}`,
    examId: "exam-1",
    studentId: "s1",
    subjectId,
    cat1: null,
    cat2: null,
    projectWork: null,
    groupWork: null,
    examScore: null,
    totalScore,
    grade: null,
    interpretation: null,
    subjectPosition: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const CORE = [
  makeSubject("eng", "English"),
  makeSubject("math", "Mathematics"),
  makeSubject("sci", "Integrated Science"),
  makeSubject("soc", "Social Studies"),
];

describe("computePromotionSuggestion", () => {
  it("returns null in override mode (no published exam)", () => {
    expect(
      computePromotionSuggestion({
        className: "Primary 5",
        divisionCoreSubjects: CORE,
        scoresForStudent: [],
        examPublished: false,
      })
    ).toBeNull();
  });

  it("JHS 3 → graduate regardless of scores", () => {
    expect(
      computePromotionSuggestion({
        className: "JHS 3",
        divisionCoreSubjects: CORE,
        scoresForStudent: [],
        examPublished: true,
      })
    ).toEqual({
      suggestedDecision: "graduate",
      suggestedReason: "Completed JHS 3",
      failedCoreSubjects: 0,
    });
  });


  it("suggests promote when 0 core subjects failed", () => {
    const result = computePromotionSuggestion({
      className: "Primary 5",
      divisionCoreSubjects: CORE,
      scoresForStudent: CORE.map((s) => makeScore(s.id, 60)),
      examPublished: true,
    });
    expect(result).toEqual({
      suggestedDecision: "promote",
      suggestedReason: "",
      failedCoreSubjects: 0,
    });
  });

  it("suggests promote when 2 core subjects failed (threshold is 3)", () => {
    const result = computePromotionSuggestion({
      className: "Primary 5",
      divisionCoreSubjects: CORE,
      scoresForStudent: [
        makeScore("eng", 30), // failed
        makeScore("math", 35), // failed
        makeScore("sci", 60), // pass
        makeScore("soc", 60), // pass
      ],
      examPublished: true,
    });
    expect(result?.suggestedDecision).toBe("promote");
    expect(result?.failedCoreSubjects).toBe(2);
  });

  it("suggests repeat when 3+ core subjects failed", () => {
    const result = computePromotionSuggestion({
      className: "Primary 5",
      divisionCoreSubjects: CORE,
      scoresForStudent: [
        makeScore("eng", 30),
        makeScore("math", 35),
        makeScore("sci", 38),
        makeScore("soc", 50),
      ],
      examPublished: true,
    });
    expect(result?.suggestedDecision).toBe("repeat");
    expect(result?.failedCoreSubjects).toBe(3);
    expect(result?.suggestedReason).toContain("Failed 3 core subjects");
    expect(result?.suggestedReason).toContain("English");
    expect(result?.suggestedReason).toContain("Mathematics");
    expect(result?.suggestedReason).toContain("Integrated Science");
  });

  it("missing scores are NOT counted as failures", () => {
    const result = computePromotionSuggestion({
      className: "Primary 5",
      divisionCoreSubjects: CORE,
      scoresForStudent: [makeScore("eng", 30)], // only 1 subject scored, 3 missing
      examPublished: true,
    });
    expect(result?.suggestedDecision).toBe("promote");
    expect(result?.failedCoreSubjects).toBe(1);
  });

  it("score with null totalScore is not counted as failed", () => {
    const result = computePromotionSuggestion({
      className: "Primary 5",
      divisionCoreSubjects: CORE,
      scoresForStudent: CORE.map((s) => makeScore(s.id, null)),
      examPublished: true,
    });
    expect(result?.suggestedDecision).toBe("promote");
    expect(result?.failedCoreSubjects).toBe(0);
  });

  it("threshold is strict — totalScore exactly 40 is a pass", () => {
    const result = computePromotionSuggestion({
      className: "Primary 5",
      divisionCoreSubjects: CORE,
      scoresForStudent: CORE.map((s) => makeScore(s.id, 40)),
      examPublished: true,
    });
    expect(result?.suggestedDecision).toBe("promote");
    expect(result?.failedCoreSubjects).toBe(0);
  });
});
