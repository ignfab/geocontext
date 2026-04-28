/**
 * Integration test: adminexpress tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectNonEmptyResults } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";
import { paris } from "../samples.js";

interface AdminexpressResult {
  results: Array<{
    type: string;
    id: string;
    bbox?: number[];
    feature_ref: {
      typename: string;
      feature_id: string;
    };
    [key: string]: unknown;
  }>;
}

describe("Adminexpress Tool (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should return administrative units for Paris", async () => {
    const result = await callTool<AdminexpressResult>(getHandle().client, "adminexpress", {
      lon: paris.lon,
      lat: paris.lat,
    });

    expectNonEmptyResults(result);

    // Check that at least one result has a type and id
    const first = result.results[0];
    expect(first.type).toBeDefined();
    expect(first.id).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should include feature_ref in results", async () => {
    const result = await callTool<AdminexpressResult>(getHandle().client, "adminexpress", {
      lon: paris.lon,
      lat: paris.lat,
    });

    expectNonEmptyResults(result);
    for (const unit of result.results) {
      expect(unit.feature_ref).toBeDefined();
      expect(unit.feature_ref.typename).toBeDefined();
      expect(unit.feature_ref.feature_id).toBeDefined();
    }
  }, INTEGRATION_CONFIG.timeout);
});
