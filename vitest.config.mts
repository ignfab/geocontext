import { defineConfig } from "vitest/config";

const MILLISECONDS = 1000;

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^(\.{1,2}\/.*)\.js$/,
        replacement: "$1",
      },
    ],
  },
  test: {
    globals: false,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**/*"],
    testTimeout: 60 * MILLISECONDS,
    // Default value, set explicitly because the suite relies on per-file isolation
    // (it also stops Vitest from suggesting `isolate: false`).
    isolate: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx,js,jsx}"],
    },
  },
});
