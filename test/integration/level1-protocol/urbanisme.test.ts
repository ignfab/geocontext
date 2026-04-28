/**
 * Integration test: urbanisme tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectNonEmptyResults } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";
import { besancon } from "../samples.js";

interface UrbanismeResult {
  results: Array<{
    type: string;
    id: string;
    bbox?: number[];
    feature_ref?: {
      typename: string;
      feature_id: string;
    };
    distance: number;
    [key: string]: unknown;
  }>;
}

describe("Urbanisme Tool (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should return urban planning objects for Besançon", async () => {
    const result = await callTool<UrbanismeResult>(getHandle().client, "urbanisme", {
      lon: besancon.lon,
      lat: besancon.lat,
    });

    expectNonEmptyResults(result);

    const first = result.results[0];
    expect(first.type).toBeDefined();
    expect(first.id).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);
});
