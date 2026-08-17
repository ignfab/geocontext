/**
 * Integration test: describe type tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectToolCallToThrow } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

interface DescribeResult {
  typename: string;
  url: string;
  description: string;
  geometry_kind?: string;
  required: string[];
  properties: Array<{
    name: string;
    description?: string;
    oneOf?: string[];
  }>;
}

describe("GPF Describe Type (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should describe BDTOPO_V3:batiment", async () => {
    const result = await callTool<DescribeResult>(getHandle().client, "gpf_describe_type", {
      typename: "BDTOPO_V3:batiment",
    });

    expect(result.typename).toBe("BDTOPO_V3:batiment");
    expect(result.url).toContain("BDTOPO_V3");
    expect(Array.isArray(result.required)).toBe(true);
    expect(result.properties).toBeDefined();
    expect(result.properties.length).toBeGreaterThan(0);
    expect(result.properties[0].name).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for empty typename", async () => {
    await expectToolCallToThrow(callTool(getHandle().client, "gpf_describe_type", { typename: "" }));
  }, INTEGRATION_CONFIG.timeout);
});
