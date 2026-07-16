import { PROMOTION_DECISION_KIND } from "@/features/promotions/types";

// Minimal shape needed to pick a class — works for both Drizzle rows and
// hydrated view types.
type ClassLike = { id: string; name: string; division: string };

const SEQUENCE = ["KG 1", "KG 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6", "JHS 1", "JHS 2", "JHS 3"];

// Returns the next level name in the basic-school sequence, e.g.
// "Primary 5" → "Primary 6", "JHS 1" → "JHS 2". JHS 3 has no successor.
export function nextLevelName(currentClassName: string): string | null {
  const idx = SEQUENCE.indexOf(currentClassName);
  if (idx < 0 || idx === SEQUENCE.length - 1) return null;
  return SEQUENCE[idx + 1];
}

// Returns the same level (used by the Repeat path).
export function sameLevelName(currentClassName: string): string {
  return currentClassName;
}

// Auto-pick the target class for either Promote or Repeat. With single-
// stream classes there's at most one candidate per level, so this is
// just a name match.
export function autoPickTargetClass(
  currentClassName: string,
  candidateClasses: ClassLike[],
  mode: typeof PROMOTION_DECISION_KIND.PROMOTE | typeof PROMOTION_DECISION_KIND.REPEAT
): string | null {
  const target =
    mode === PROMOTION_DECISION_KIND.PROMOTE
      ? nextLevelName(currentClassName)
      : sameLevelName(currentClassName);
  if (!target) return null;
  return candidateClasses.find((c) => c.name === target)?.id ?? null;
}
