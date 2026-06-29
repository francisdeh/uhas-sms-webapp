import { test, expect } from "@playwright/test";
import path from "node:path";

// Promotion season open flow. Term-3 End-of-Term exam is published in the
// seed, so opening the season is a single-click action with no override
// dialog. Once open, the Teacher's promotions page should switch from the
// "season closed" empty state to showing their class list.

test.describe.serial("Promotions · season open chain", () => {
  test("Admin opens the promotion season", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: path.join(__dirname, "../fixtures/admin.json"),
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/admin/promotions");
      await expect(
        page.getByRole("heading", { name: /student promotions/i })
      ).toBeVisible();

      await page.getByRole("button", { name: /open promotion season/i }).click();

      await expect(
        page.locator('[data-sonner-toast] [data-title]', {
          hasText: /promotion season opened\.?/i,
        })
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("Teacher sees their classes once the season is open", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: path.join(__dirname, "../fixtures/teacher.json"),
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/teacher/promotions");
      await expect(
        page.getByRole("heading", { name: /^promotions$/i })
      ).toBeVisible();
      // Teacher's two assigned classes (JHS 1 & JHS 2) appear as links.
      await expect(page.getByRole("link", { name: /JHS 1/i })).toBeVisible();
      await expect(page.getByRole("link", { name: /JHS 2/i })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
