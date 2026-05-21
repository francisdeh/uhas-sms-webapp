import { test, expect } from "@playwright/test";
import path from "node:path";

// Parent: navigates from /parent/results to a child's published report card.
// The seed links the parent (parent@uhas.edu.gh) to two children — Akpene
// Agbeko (UHAS-2026-0001) and Edinam Mensah (UHAS-2026-0003) — and publishes
// the Mid-Term 1 and End-of-Term 3 exams for the current year.
test.use({
  storageState: path.join(__dirname, "../fixtures/parent.json"),
});

test.describe("Parent · Report card", () => {
  test("opens a published report card from the results list", async ({ page }) => {
    await page.goto("/parent/results");
    await expect(page.getByRole("heading", { name: /^results$/i })).toBeVisible();

    // Akpene's card should be present (middle name is "Worlanyo" in the seed).
    await expect(page.getByText(/Akpene Worlanyo Agbeko/)).toBeVisible();

    // Click into the Mid-Term 1 report under Akpene's section.
    await page
      .getByRole("link", { name: /Mid-Term 1/ })
      .first()
      .click();

    await page.waitForURL(/\/parent\/results\/UHAS-2026-0001\/exam-midterm-t1-2026$/);
    // Report card renders the child's name in uppercase + the term header.
    await expect(page.getByText(/akpene/i).first()).toBeVisible();
    await expect(page.getByText(/mid-term report/i)).toBeVisible();
  });
});
