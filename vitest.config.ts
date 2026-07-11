import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // setup.ts sets env (in-memory DB, dry-run) before any src module is imported.
    setupFiles: ["./test/setup.ts"],
    // Each test file gets its own worker, hence its own :memory: database.
    pool: "forks",
  },
});
