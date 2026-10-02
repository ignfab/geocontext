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
    include: ["test/**/*.perf.test.ts"],
    testTimeout: 60 * MILLISECONDS,
    // Run one file at a time: these tests measure wall-clock time, which test
    // files running in parallel would inflate.
    fileParallelism: false,
  },
});
