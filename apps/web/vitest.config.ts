import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // DB-touching tests share one Postgres — keep test files sequential.
    pool: "forks",
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
