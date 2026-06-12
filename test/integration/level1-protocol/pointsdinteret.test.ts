/**
 * Integration test: geocode tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectNonEmptyResults, expectToolCallToThrow } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

export type PointsDInteretResult = {
  results: Array<{
    name: string;
    categories: string[];
    city?: string;
    zipcode?: string;
    distance: number;
    centroid?: {
      lon: number,
      lat: number
    };
  }>;
};


describe("Geocode Tool (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should find a result for a point in a Saint-Pierre (Réunion)", async () => {
    const result = await callTool<PointsDInteretResult>(getHandle().client, "pointsdinteret", {
      lon: 55.482554,
      lat: -20.904138,
      maximumResponses: 1,
    });

    expectNonEmptyResults(result);

    const first = result.results[0];
    expect(first.name).toBeDefined();
    expect(first.categories).toBeDefined();
    expect(first.distance).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should find the Refuge de la Femma from approximate coordinates", async () => {
    const result = await callTool<PointsDInteretResult>(getHandle().client, "pointsdinteret", {
      lon: 6.929378,
      lat: 45.362713,
      maximumResponses: 5,
    });

    expectNonEmptyResults(result);
    const text = JSON.stringify(result).toLowerCase();
    expect(text).toContain("refuge de la femma");
    expect(text).toContain("val-cenis");
    expect(text).toContain("savoie");
    expect(text).toContain("auvergne-rhône-alpes");
  }, INTEGRATION_CONFIG.timeout);
});
