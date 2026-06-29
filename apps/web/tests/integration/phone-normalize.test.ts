/**
 * Tests for the phone normalisation helper exported from LoginForm.
 *
 * The actual UI form is exercised end-to-end by Playwright; this Vitest
 * suite locks the input → E.164 mapping that LoginForm's submit handler
 * relies on, so future tweaks to country-code handling can't silently
 * regress (e.g. accidentally treating `0200000001` as a US number).
 */

import { describe, expect, it } from "vitest";

import { normalizePhone } from "@/features/auth/components/LoginForm";

describe("normalizePhone", () => {
  it("passes through canonical E.164", () => {
    expect(normalizePhone("+233200000001")).toBe("+233200000001");
  });

  it("converts Ghana local 0XX to +233XX", () => {
    expect(normalizePhone("0200000001")).toBe("+233200000001");
  });

  it("strips formatting (spaces, dashes, parens, dots)", () => {
    expect(normalizePhone("+233 20-000.0001")).toBe("+233200000001");
    expect(normalizePhone("020 000 0001")).toBe("+233200000001");
    expect(normalizePhone("(0)20-000-0001")).toBe("+233200000001");
  });

  it("treats 00 prefix as international-out", () => {
    expect(normalizePhone("00233200000001")).toBe("+233200000001");
    expect(normalizePhone("00 233 200 000 001")).toBe("+233200000001");
  });

  it("prepends + when missing on international-looking numbers", () => {
    expect(normalizePhone("233200000001")).toBe("+233200000001");
    expect(normalizePhone("15551234567")).toBe("+15551234567");
  });

  it("handles foreign numbers with formatting", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("returns empty for non-phone-like input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("   ")).toBe("");
    expect(normalizePhone("admin@uhas.edu.gh")).toBe("");
    expect(normalizePhone("just letters")).toBe("");
  });
});
