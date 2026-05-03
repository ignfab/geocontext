/**
 * Integration test: WFS describe type tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectToolCallToThrow } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

interface WfsDescribeResult {
  id: string;
  namespace: string;
  name: string;
  title: string;
  description: string;
  properties: Array<{
    name: string;
    type: string;
    title?: string;
    description?: string;
    enum?: string[];
    defaultCrs?: string;
  }>;
}

describe("WFS Describe Type (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should describe BDTOPO_V3:batiment", async () => {
    const result = await callTool<WfsDescribeResult>(getHandle().client, "gpf_wfs_describe_type", {
      typename: "BDTOPO_V3:batiment",
    });

    expect(result.id).toBe("BDTOPO_V3:batiment");
    expect(result.name).toBe("batiment");
    expect(result.properties).toBeDefined();
    expect(result.properties.length).toBeGreaterThan(0);

    // Check that properties have expected fields
    const firstProp = result.properties[0];
    expect(firstProp.name).toBeDefined();
    expect(firstProp.type).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for empty typename", async () => {
    await expectToolCallToThrow(callTool(getHandle().client, "gpf_wfs_describe_type", { typename: "" }));
  }, INTEGRATION_CONFIG.timeout);
});
