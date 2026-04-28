/**
 * Integration test: geocode tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectNonEmptyResults, expectToolCallToThrow } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

interface GeocodeResult {
  results: Array<{
    lon: number;
    lat: number;
    fulltext: string;
    kind?: string;
    city?: string;
    zipcode?: string;
  }>;
}

describe("Geocode Tool (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should geocode 'Paris' and return results", async () => {
    const result = await callTool<GeocodeResult>(getHandle().client, "geocode", {
      text: "Paris",
      maximumResponses: 3,
    });

    expectNonEmptyResults(result);

    const first = result.results[0];
    expect(first.lon).toBeDefined();
    expect(first.lat).toBeDefined();
    expect(first.fulltext).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should find Paris in geocoding results", async () => {
    const result = await callTool<GeocodeResult>(getHandle().client, "geocode", {
      text: "Paris",
      maximumResponses: 1,
    });

    expectNonEmptyResults(result);
    const text = JSON.stringify(result).toLowerCase();
    expect(text).toContain("paris");
  }, INTEGRATION_CONFIG.timeout);

  it("should geocode 'Chamonix' and return the commune", async () => {
    const result = await callTool<GeocodeResult>(getHandle().client, "geocode", {
      text: "Chamonix",
      maximumResponses: 1,
    });

    expectNonEmptyResults(result);
    const text = JSON.stringify(result).toLowerCase();
    expect(text).toContain("chamonix");
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for empty text", async () => {
    await expectToolCallToThrow(callTool(getHandle().client, "geocode", { text: "" }));
  }, INTEGRATION_CONFIG.timeout);
});
