/**
 * Integration test: WFS GetFeatureById tool with real API calls.
 *
 * This test first calls adminexpress to get a valid feature_ref,
 * then uses gpf_wfs_get_feature_by_id to retrieve it.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import type { McpServerHandle } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import {
  expectFeatureCollectionWithFeatures,
  expectNonEmptyResults,
  expectToolCallToThrow,
} from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";
import { paris } from "../samples.js";

interface AdminexpressResult {
  results: Array<{
    type: string;
    id: string;
    feature_ref: {
      typename: string;
      feature_id: string;
    };
    [key: string]: unknown;
  }>;
}

interface GetFeatureByIdResult {
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

describe("WFS GetFeatureById (integration)", () => {
  let featureRef: { typename: string; feature_id: string };

  const { getHandle } = withMcpServer({
    connectTimeout: INTEGRATION_CONFIG.timeout,
    setup: async (handle: McpServerHandle) => {
      // Get a valid feature_ref from adminexpress
      const adminResult = await callTool<AdminexpressResult>(handle.client, "adminexpress", {
        lon: paris.lon,
        lat: paris.lat,
      });

      expectNonEmptyResults(adminResult);
      featureRef = adminResult.results[0].feature_ref;
    },
  });

  it("should retrieve a feature by typename and feature_id", async () => {
    const result = await callTool<GetFeatureByIdResult>(getHandle().client, "gpf_wfs_get_feature_by_id", {
      typename: featureRef.typename,
      feature_id: featureRef.feature_id,
    });

    expectFeatureCollectionWithFeatures(result, 1);
    expect(result.features.length).toBe(1);
    expect(result.features[0].id).toBeDefined();
    expect(result.features[0].properties).toBeDefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for invalid typename", async () => {
    await expectToolCallToThrow(
      callTool(getHandle().client, "gpf_wfs_get_feature_by_id", {
        typename: "INVALID:type",
        feature_id: "nonexistent",
      }),
    );
  }, INTEGRATION_CONFIG.timeout);
});
