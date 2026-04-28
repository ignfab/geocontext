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
    include: ["test/integration/level2-agent/**/*.test.ts"],
    testTimeout: 120 * MILLISECONDS,
    // Run sequentially: each test starts its own MCP server
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
