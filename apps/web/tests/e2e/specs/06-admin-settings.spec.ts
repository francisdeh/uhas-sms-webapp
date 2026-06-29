import { test, expect } from "@playwright/test";
import path from "node:path";
import { waitForFormHydration } from "../helpers";

// Admin: edit the school name on the Identity tab, refresh, confirm the
// new name shows up in the sidebar (which reads from the same schools row).
test.use({
  storageState: path.join(__dirname, "../fixtures/admin.json"),
});

test.describe("Admin · Settings", () => {
  test("Identity tab persists the school name across reload", async ({ page }) => {
    const suffix = Date.now().toString().slice(-5);
    const newName = `UHAS Basic School ${suffix}`;

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: /school settings/i })).toBeVisible();
    await waitForFormHydration(page);

    const nameInput = page.getByLabel(/school name/i);
    await nameInput.fill(newName);
    await page.getByRole("button", { name: /save identity/i }).click();
    await expect(page.getByText(/school identity updated/i)).toBeVisible();

    // Reload — the form should keep the new value from the DB, not the
    // default. Also assert the sidebar reflects the change.
    await page.reload();
    await waitForFormHydration(page);
    await expect(page.getByLabel(/school name/i)).toHaveValue(newName);
    await expect(page.getByText(newName, { exact: false }).first()).toBeVisible();

    // Restore so subsequent runs are deterministic.
    await page.getByLabel(/school name/i).fill("UHAS Basic School");
    await page.getByRole("button", { name: /save identity/i }).click();
    await expect(page.getByText(/school identity updated/i)).toBeVisible();
  });
});
