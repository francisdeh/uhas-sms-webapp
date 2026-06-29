import { describe, expect, it } from "vitest";
import { nextAcademicYear } from "./academic-year";

describe("nextAcademicYear", () => {
  it("increments both halves", () => {
    expect(nextAcademicYear("2025/2026")).toBe("2026/2027");
    expect(nextAcademicYear("2024/2025")).toBe("2025/2026");
  });

  it("throws on malformed input", () => {
    expect(() => nextAcademicYear("not-a-year")).toThrow();
    expect(() => nextAcademicYear("2025")).toThrow();
    expect(() => nextAcademicYear("")).toThrow();
  });
});
