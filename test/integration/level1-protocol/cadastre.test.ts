/**
 * Integration test: cadastre tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectNonEmptyResults } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";
import { paris } from "../samples.js";

interface CadastreResult {
  results: Array<{
    type: string;
    id: string;
    bbox?: number[];
    feature_ref: {
      typename: string;
      feature_id: string;
    };
    distance: number;
    source: string;
    [key: string]: unknown;
  }>;
}

describe("Cadastre Tool (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should return cadastral objects near Paris", async () => {
    const result = await callTool<CadastreResult>(getHandle().client, "cadastre", {
      lon: paris.lon,
      lat: paris.lat,
    });

    expectNonEmptyResults(result);

    const first = result.results[0];
    expect(first.type).toBeDefined();
    expect(first.id).toBeDefined();
    expect(first.distance).toBeDefined();
    expect(typeof first.distance).toBe("number");
  }, INTEGRATION_CONFIG.timeout);

  it("should include feature_ref in cadastral results", async () => {
    const result = await callTool<CadastreResult>(getHandle().client, "cadastre", {
      lon: paris.lon,
      lat: paris.lat,
    });

    expectNonEmptyResults(result);
    for (const obj of result.results) {
      expect(obj.feature_ref).toBeDefined();
      expect(obj.feature_ref.typename).toBeDefined();
      expect(obj.feature_ref.feature_id).toBeDefined();
    }
  }, INTEGRATION_CONFIG.timeout);
});
