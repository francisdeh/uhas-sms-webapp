import type { PromotionDecisionKind } from "@/features/promotions/types";
import type { Score } from "@/features/exams/types";
import type { Subject } from "@/features/classes/types";

export type Suggestion = {
  suggestedDecision: PromotionDecisionKind | null;
  suggestedReason: string;
  failedCoreSubjects: number;
};

type Args = {
  className: string;
  divisionCoreSubjects: Subject[];
  scoresForStudent: Score[];
  examPublished: boolean;
};

const FAIL_THRESHOLD = 40;
const FAIL_COUNT_REPEAT = 3;

export function computePromotionSuggestion(args: Args): Suggestion | null {
  // Override mode (no published Term-3 EndOfTerm) → no algorithmic default.
  if (!args.examPublished) return null;

  if (args.className === "JHS 3") {
    return {
      suggestedDecision: "graduate",
      suggestedReason: "Completed JHS 3",
      failedCoreSubjects: 0,
    };
  }

  const scoreBySubject = new Map(args.scoresForStudent.map((s) => [s.subjectId, s]));
  const failed = args.divisionCoreSubjects.filter((sub) => {
    const score = scoreBySubject.get(sub.id);
    return score?.totalScore != null && score.totalScore < FAIL_THRESHOLD;
  });

  if (failed.length >= FAIL_COUNT_REPEAT) {
    return {
      suggestedDecision: "repeat",
      suggestedReason: `Failed ${failed.length} core subjects: ${failed.map((s) => s.name).join(", ")}`,
      failedCoreSubjects: failed.length,
    };
  }

  return {
    suggestedDecision: "promote",
    suggestedReason: "",
    failedCoreSubjects: failed.length,
  };
}
