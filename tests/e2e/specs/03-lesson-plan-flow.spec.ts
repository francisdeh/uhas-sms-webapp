import { test, expect } from "@playwright/test";
import path from "node:path";

// Lesson-plan approval chain. The seed leaves two plans for STAFF-005:
//   • lp-001 "Reading Comprehension — Narrative Texts"  — submitted (Unit Head queue)
//   • lp-002 "Population and Settlement Patterns"      — unit_head_approved (DH queue)
//
// First we let the JHS Unit Head approve lp-001, then we let the JHS Deputy
// Head approve lp-002. Specs run serially (workers: 1, fullyParallel: false)
// so the order is deterministic.

test.describe.serial("Lesson plan · approval chain", () => {
  test("Unit Head approves a submitted plan", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: path.join(__dirname, "../fixtures/unit-head-jhs.json"),
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/teacher/reviews");
      await expect(
        page.getByRole("heading", { name: /unit head reviews/i })
      ).toBeVisible();

      const card = page.getByRole("button", {
        name: /Reading Comprehension/i,
      });
      await expect(card).toBeVisible();
      await card.click();

      await page.getByRole("button", { name: /^approve$/i }).click();
      // Target the Sonner toast specifically — the page also renders the
      // word "Approved" in a status pill after the action succeeds.
      await expect(
        page.locator('[data-sonner-toast] [data-title]', { hasText: /^approved\.?$/i })
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("Deputy Head approves a unit-head-approved plan", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: path.join(__dirname, "../fixtures/deputy-head-jhs.json"),
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/deputy-head/lesson-plans");
      await expect(
        page.getByRole("heading", { name: /lesson plan approvals/i })
      ).toBeVisible();

      const card = page.getByRole("button", {
        name: /Population and Settlement Patterns/i,
      });
      await expect(card).toBeVisible();
      await card.click();

      await page.getByRole("button", { name: /^approve$/i }).click();
      // Target the Sonner toast specifically — the page also renders the
      // word "Approved" in a status pill after the action succeeds.
      await expect(
        page.locator('[data-sonner-toast] [data-title]', { hasText: /^approved\.?$/i })
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
