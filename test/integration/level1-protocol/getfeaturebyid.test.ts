/**
 * Integration test: GetFeatureById tool with real API calls.
 *
 * This test first calls adminexpress to get a valid feature_ref,
 * then uses gpf_get_feature_by_id to retrieve it.
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
    geometry: null;
    feature_ref?: {
      typename: string;
      feature_id: string;
    };
    bbox?: GeoJSON.BBox;
    centroid?: { lon: number, lat: number };
  }>;
  totalFeatures?: number;
  numberMatched?: number;
}

describe("GetFeatureById (integration)", () => {
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
    const result = await callTool<GetFeatureByIdResult>(getHandle().client, "gpf_get_feature_by_id", {
      typename: featureRef.typename,
      feature_id: featureRef.feature_id,
    });

    expectFeatureCollectionWithFeatures(result, 1);
    expect(result.features.length).toBe(1);
    expect(result.features[0].id).toBeDefined();
    expect(result.features[0].properties).toBeDefined();
    expect(result.features[0].bbox).toBeUndefined();
    expect(result.features[0].centroid).toBeUndefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should retrieve a centroid and a bbox", async () => {
    const result = await callTool<GetFeatureByIdResult>(getHandle().client, "gpf_get_feature_by_id", {
      typename: featureRef.typename,
      feature_id: featureRef.feature_id,
      geometry_extra: ["centroid", "bbox"]
    });

    expectFeatureCollectionWithFeatures(result, 1);
    expect(result.features.length).toBe(1);
    expect(result.features[0].id).toBeDefined();
    expect(result.features[0].properties).toBeDefined();
    expect(result.features[0].bbox).toBeDefined();
    expect(result.features[0].centroid).toBeDefined();
    expect(result.features[0].centroid?.lon).toBeCloseTo(2.382778372262143);
    expect(result.features[0].centroid?.lat).toBeCloseTo(48.8518070503727);
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for invalid typename", async () => {
    await expectToolCallToThrow(
      callTool(getHandle().client, "gpf_get_feature_by_id", {
        typename: "INVALID:type",
        feature_id: "nonexistent",
      }),
    );
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for when trying to combine `geometry_extra` with a `result_type` other than `request`", async () => {
    await expectToolCallToThrow(
      callTool(getHandle().client, "gpf_get_feature_by_id", {
        typename: featureRef.typename,
        feature_id: featureRef.feature_id,
        geometry_extra: ["centroid"],
        result_type: "http_post_request"
      }),
    );
  }, INTEGRATION_CONFIG.timeout);
});
