import { describe, expect, it } from "vitest";
import { normalizeGhanaPhone } from "./phone";

describe("normalizeGhanaPhone", () => {
  it.each([
    ["0244000111", "+233244000111"],
    ["233244000111", "+233244000111"],
    ["+233244000111", "+233244000111"],
    [" 0244 000 111 ", "+233244000111"],
    ["024-400-0111", "+233244000111"],
  ] as const)("normalizes %s", (raw, expected) => {
    expect(normalizeGhanaPhone(raw)).toBe(expected);
  });

  it.each(["12345", "+12442000111", "0244000", "02440001112", "not-a-phone", ""])(
    "rejects %s",
    (raw) => {
      expect(normalizeGhanaPhone(raw)).toBeNull();
    }
  );
});
