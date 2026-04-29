/**
 * Integration test: WFS GetFeatures tool with real API calls.
 *
 * Uses BDTOPO_V3:commune to test attribute filtering with a known code INSEE.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import {
  expectFeatureCollectionWithFeatures,
  expectToolCallToThrow,
} from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";

interface GetFeaturesResult {
  type: "FeatureCollection";
  features: Array<{
    type: string;
    id: string;
    properties: Record<string, unknown>;
    geometry?: unknown;
    feature_ref?: {
      typename: string;
      feature_id: string;
    };
  }>;
  totalFeatures?: number;
  numberMatched?: number;
}

describe("WFS GetFeatures (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should query BDTOPO_V3:commune with attribute filter (code_insee=75056)", async () => {
    const result = await callTool<GetFeaturesResult>(getHandle().client, "gpf_wfs_get_features", {
      typename: "BDTOPO_V3:commune",
      where: [{ property: "code_insee", operator: "eq", value: "75056" }],
      select: ["code_insee", "nom_officiel"],
      limit: 1,
    });

    expectFeatureCollectionWithFeatures(result);

    const first = result.features[0];
    expect(first.properties).toBeDefined();
    expect(first.properties.code_insee).toBe("75056");
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for invalid typename", async () => {
    await expectToolCallToThrow(
      callTool(getHandle().client, "gpf_wfs_get_features", {
        typename: "INVALID:type",
        limit: 1,
      }),
    );
  }, INTEGRATION_CONFIG.timeout);
});
