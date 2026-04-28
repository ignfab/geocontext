/**
 * Integration test: WFS search types tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectNonEmptyResults, expectToolCallToThrow } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

interface WfsSearchResult {
  results: Array<{
    id: string;
    title: string;
    description: string;
    score?: number;
  }>;
}

describe("WFS Search Types (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should find 'batiment' types", async () => {
    const result = await callTool<WfsSearchResult>(getHandle().client, "gpf_wfs_search_types", {
      query: "bâtiment",
    });

    expectNonEmptyResults(result);

    const ids = result.results.map((r) => r.id);
    expect(ids).toContain("BDTOPO_V3:batiment");
  }, INTEGRATION_CONFIG.timeout);

  it("should find cadastral parcel types", async () => {
    const result = await callTool<WfsSearchResult>(getHandle().client, "gpf_wfs_search_types", {
      query: "parcelle cadastrale",
    });

    expectNonEmptyResults(result);

    const ids = result.results.map((r) => r.id);
    // Should find parcellaire express types
    expect(ids.some((id) => id.includes("PARCELLAIRE_EXPRESS") || id.includes("parcelle"))).toBe(true);
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for empty query", async () => {
    await expectToolCallToThrow(callTool(getHandle().client, "gpf_wfs_search_types", { query: "" }));
  }, INTEGRATION_CONFIG.timeout);
});
