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
    globals: true,
    environment: "node",
    include: ["test/integration/level1-protocol/**/*.test.ts"],
    testTimeout: 60 * MILLISECONDS,
    // Run sequentially to avoid overloading the GPF APIs
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
