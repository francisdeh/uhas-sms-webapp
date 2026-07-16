import { describe, expect, it } from "vitest";
import { nextLevelName, sameLevelName, autoPickTargetClass } from "./next-class-resolver";
import { PROMOTION_DECISION_KIND } from "@/features/promotions/types";

describe("nextLevelName", () => {
  it.each([
    ["KG 1", "KG 2"],
    ["KG 2", "Primary 1"],
    ["Primary 5", "Primary 6"],
    ["Primary 6", "JHS 1"],
    ["JHS 1", "JHS 2"],
    ["JHS 2", "JHS 3"],
  ])("%s → %s", (input, expected) => {
    expect(nextLevelName(input)).toBe(expected);
  });

  it("JHS 3 has no successor", () => {
    expect(nextLevelName("JHS 3")).toBeNull();
  });

  it("unknown class returns null", () => {
    expect(nextLevelName("Year 12")).toBeNull();
  });
});

describe("sameLevelName", () => {
  it("returns the same level name as-is (no streams to strip)", () => {
    expect(sameLevelName("JHS 1")).toBe("JHS 1");
    expect(sameLevelName("Primary 5")).toBe("Primary 5");
  });
});

describe("autoPickTargetClass", () => {
  const candidates = [
    { id: "p6", name: "Primary 6", division: "Upper Primary" },
    { id: "jhs1", name: "JHS 1", division: "JHS" },
  ];

  it("promote returns the next-level candidate", () => {
    expect(autoPickTargetClass("Primary 5", candidates, PROMOTION_DECISION_KIND.PROMOTE)).toBe("p6");
    expect(autoPickTargetClass("Primary 6", candidates, PROMOTION_DECISION_KIND.PROMOTE)).toBe("jhs1");
  });

  it("repeat returns the same-level candidate", () => {
    expect(autoPickTargetClass("Primary 6", candidates, PROMOTION_DECISION_KIND.REPEAT)).toBe("p6");
  });

  it("returns null when no candidate matches the level", () => {
    expect(autoPickTargetClass("KG 2", candidates, PROMOTION_DECISION_KIND.PROMOTE)).toBeNull();
  });

  it("returns null when JHS 3 promotes (no successor)", () => {
    expect(autoPickTargetClass("JHS 3", candidates, PROMOTION_DECISION_KIND.PROMOTE)).toBeNull();
  });
});
