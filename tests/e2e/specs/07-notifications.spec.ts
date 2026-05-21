import { test, expect } from "@playwright/test";
import path from "node:path";
import { waitForFormHydration } from "../helpers";

// Admin posts a school-wide announcement → log in as the parent → bell
// shows an unread indicator → opening the bell auto-marks-as-read.
test.describe("Notifications · announcement fans out + bell auto-clears", () => {
  test("parent sees the unread badge and the announcement in the bell", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext({
      storageState: path.join(__dirname, "../fixtures/admin.json"),
    });
    const adminPage = await adminContext.newPage();

    // Post the announcement as admin.
    const title = `E2E Announcement ${Date.now().toString().slice(-6)}`;
    await adminPage.goto("/admin/announcements");
    await expect(
      adminPage.getByRole("heading", { name: /announcements/i })
    ).toBeVisible();

    await adminPage.getByRole("button", { name: /new announcement/i }).click();
    await waitForFormHydration(adminPage);
    await adminPage.getByLabel(/title/i).fill(title);
    await adminPage.getByLabel(/message/i).fill("This is an e2e announcement.");
    // Audience defaults to "all" — leave it.
    await adminPage.getByRole("button", { name: /^post$/i }).click();
    await expect(adminPage.getByText(title)).toBeVisible({ timeout: 10_000 });
    await adminContext.close();

    // Open a fresh parent session and check the bell.
    const parentContext = await browser.newContext({
      storageState: path.join(__dirname, "../fixtures/parent.json"),
    });
    const parentPage = await parentContext.newPage();
    await parentPage.goto("/parent");

    const bell = parentPage.getByRole("button", {
      name: /notifications.*unread/i,
    });
    await expect(bell).toBeVisible({ timeout: 10_000 });

    await bell.click();
    await expect(parentPage.getByText(title)).toBeVisible();
    // After opening, the dropdown auto-marks as read; close + re-check the
    // accessible label dropped the "unread" suffix.
    await parentPage.keyboard.press("Escape");
    await expect(
      parentPage.getByRole("button", { name: /^notifications$/i })
    ).toBeVisible({ timeout: 5_000 });

    await parentContext.close();
  });
});
