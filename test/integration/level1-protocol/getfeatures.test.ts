/**
 * Integration test: GetFeatures tool with real API calls.
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
import { besancon } from "../samples.js";

interface AdminexpressResult {
  results: Array<{
    type: string;
    feature_ref: { typename: string; feature_id: string };
  }>;
}

interface GetFeaturesResult {
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
    intersection_area?: number | null;
  }>;
  totalFeatures?: number;
  numberMatched?: number;
}

describe("GetFeatures (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should query BDTOPO_V3:commune with attribute filter (code_insee=75056)", async () => {
    const result = await callTool<GetFeaturesResult>(getHandle().client, "gpf_get_features", {
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
      callTool(getHandle().client, "gpf_get_features", {
        typename: "INVALID:type",
        limit: 1,
      }),
    );
  }, INTEGRATION_CONFIG.timeout);

  it("should include the bbox when asked in spatial_extras", async () => {
    const result = await callTool<GetFeaturesResult>(getHandle().client, "gpf_get_features", {
      typename: "BDTOPO_V3:commune",
      where: [{ property: "code_insee", operator: "eq", value: "75056" }],
      select: ["code_insee", "nom_officiel"],
      spatial_extras: ["bbox"],
      limit: 1,
    });

    expectFeatureCollectionWithFeatures(result);

    const first = result.features[0];
    expect(first.bbox).toBeDefined();
    expect((first.bbox as GeoJSON.BBox)[0]).toBeCloseTo(2.22421717);
    expect(first.centroid).toBeUndefined();
  }, INTEGRATION_CONFIG.timeout);

  it("should return a positive intersection_area with intersects_feature_filter", async () => {
    // Regression test: intersection_area was always 0 for intersects_feature_filter
    // because compileQueryParts omitted resolvedGeometryRef from its GetFeatures return value.
    // Uses Besançon (25056), fully inside the Doubs département obtained dynamically via adminexpress.
    const adminResult = await callTool<AdminexpressResult>(getHandle().client, "adminexpress", {
      lon: besancon.lon,
      lat: besancon.lat,
    });
    const deptRef = adminResult.results.find((r) => r.type === "departement")?.feature_ref;
    expect(deptRef).toBeDefined();

    const result = await callTool<GetFeaturesResult>(getHandle().client, "gpf_get_features", {
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      intersects_feature_filter: deptRef,
      where: [{ property: "code_insee", operator: "eq", value: "25056" }],
      spatial_extras: ["intersection_area"],
      limit: 1,
    });

    expectFeatureCollectionWithFeatures(result);

    const first = result.features[0];
    expect(typeof first.intersection_area).toBe("number");
    expect(first.intersection_area as number).toBeGreaterThan(0);
  }, INTEGRATION_CONFIG.timeout);
});
