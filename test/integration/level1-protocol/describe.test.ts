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
  title: string;
  description: string;
  required: string[];
  properties: Array<{
    name: string;
    type?: "string" | "boolean" | "integer" | "number";
    title?: string;
    description?: string;
    oneOf?: Array<{
      const: string;
      title: string;
      description?: string;
    }>;
  }>;
}

describe("GPF Describe Type (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should describe BDTOPO_V3:batiment", async () => {
    const result = await callTool<DescribeResult>(getHandle().client, "gpf_describe_type", {
      typename: "BDTOPO_V3:batiment",
    });

    expect(result.typename).toBe("BDTOPO_V3:batiment");
    expect(result.properties).toBeDefined();
    expect(result.properties.length).toBeGreaterThan(0);
    expect(result.required).toBeDefined();

    // Check that properties have expected fields
    const firstProp = result.properties[0];
    expect(firstProp.name).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for empty typename", async () => {
    await expectToolCallToThrow(callTool(getHandle().client, "gpf_describe_type", { typename: "" }));
  }, INTEGRATION_CONFIG.timeout);
});
