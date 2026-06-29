import { test, expect } from "@playwright/test";
import path from "node:path";

// Teacher: opens an assigned class, marks the entire roster present in one
// click, and sees a success toast confirming the bulk save.
test.use({
  storageState: path.join(__dirname, "../fixtures/teacher.json"),
});

test.describe("Teacher · Attendance", () => {
  test("mark all present saves the whole roster", async ({ page }) => {
    await page.goto("/teacher/attendance");
    await expect(page.getByRole("heading", { name: /attendance/i })).toBeVisible();

    // Teacher (Selorm Tornu, STAFF-005) is class teacher for JHS 1 and JHS 2
    // — pick JHS 1.
    await page.getByRole("link", { name: /JHS 1/ }).click();
    await page.waitForURL(/\/teacher\/attendance\/class-jhs1$/);

    await page.getByRole("button", { name: /mark all present/i }).click();

    // Toast text comes from AttendanceSheet:
    //   `All ${students.length} students marked present.`
    await expect(
      page.getByText(/all \d+ students marked present\./i)
    ).toBeVisible();
  });
});
