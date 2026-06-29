import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.e2e" });

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  testMatch: "**/*.spec.ts",
  outputDir: "./tests/e2e/.results",

  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // Boots a production-built Next server on port 3100. We avoid `next dev`
  // because its on-demand compilation fires fast-refresh mid-test and
  // wipes form state, plus its bundled chunks occasionally contain parse
  // errors. The Firebase Auth Emulator must already be running on 9099 —
  // global-setup verifies it. Run `npx dotenv-cli -e .env.e2e -- npm run
  // build` once before iterating locally; CI builds on every run.
  webServer: {
    command: "npx dotenv-cli -e .env.e2e -- next start --port 3100",
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },

  globalSetup: "./tests/e2e/global-setup.ts",

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
