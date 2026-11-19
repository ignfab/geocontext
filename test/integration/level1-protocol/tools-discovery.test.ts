/**
 * Integration test: verify that the geocontext MCP server exposes
 * all expected tools with valid schemas.
 */

import { describe, it, expect } from "vitest";
import { listTools } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { EXPECTED_TOOL_NAMES } from "../samples.js";

describe("Tools Discovery", () => {
  const { getHandle } = withMcpServer();

  it("should expose all expected tools", async () => {
    const tools = await listTools(getHandle().client);
    const toolNames = tools.map((t) => t.name);

    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(toolNames).toContain(expected);
    }
  });

  it("should expose exactly the expected number of tools", async () => {
    const tools = await listTools(getHandle().client);
    expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
  });

  it("each tool should have a valid inputSchema", async () => {
    const tools = await listTools(getHandle().client);

    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it("each tool should have a description", async () => {
    const tools = await listTools(getHandle().client);

    for (const tool of tools) {
      expect(tool.description).toBeDefined();
      expect(tool.description!.length).toBeGreaterThan(0);
    }
  });
});
