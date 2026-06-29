import { test, expect } from "@playwright/test";
import path from "node:path";
import { waitForFormHydration } from "../helpers";

// Admin: register a student via the UI → returns to the list → row visible.
test.use({
  storageState: path.join(__dirname, "../fixtures/admin.json"),
});

test.describe("Admin · Students", () => {
  test("register → list shows the new student", async ({ page }) => {
    // Use a distinct first name so we can find the row even if other specs
    // create their own students in the same DB run.
    const firstName = `Playwright${Date.now().toString().slice(-5)}`;
    const lastName = "E2E";

    await page.goto("/admin/students");
    await expect(page.getByRole("heading", { name: /students/i })).toBeVisible();

    await page.getByRole("link", { name: /register student/i }).click();
    await page.waitForURL(/\/admin\/students\/new$/);
    await waitForFormHydration(page);

    // Selects first so the form's controlled-field re-renders settle before
    // we fill the uncontrolled register() inputs. Filling first then
    // selecting was causing observable remounts in the trace.
    const triggers = page.locator('[data-slot="select-trigger"]');
    await triggers.nth(0).click();
    await page.locator('[data-slot="select-item"]', { hasText: /^Male$/ }).click();
    await triggers.nth(1).click();
    await page.locator('[data-slot="select-item"]', { hasText: /^Primary 3$/ }).click();

    const fnInput = page.getByLabel(/first name/i);
    const lnInput = page.getByLabel(/last name/i);
    const dobInput = page.getByLabel(/date of birth/i);

    await fnInput.fill(firstName);
    await lnInput.fill(lastName);
    await dobInput.fill("2015-05-15");
    await expect(fnInput).toHaveValue(firstName);
    await expect(lnInput).toHaveValue(lastName);
    await expect(dobInput).toHaveValue("2015-05-15");

    await page.getByRole("button", { name: /register student/i }).click();

    // After submit, success toast + redirect back to the list.
    await page.waitForURL(/\/admin\/students(\?|$)/);
    // The list is paginated; filter to the new student by name.
    await page.getByPlaceholder(/search by name/i).fill(firstName);
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible();
  });
});
