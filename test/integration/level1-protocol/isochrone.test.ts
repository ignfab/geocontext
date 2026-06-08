/**
 * Integration test: isochrone tool with real API calls.
 */

import { describe, it, expect } from "vitest";
import { callTool } from "../helpers/mcp-client.js";
import { withMcpServer } from "../helpers/level1-fixtures.js";
import { expectToolCallToThrow } from "../helpers/level1-assertions.js";
import { INTEGRATION_CONFIG } from "../config/shared.js";
import { paris } from "../samples.js";

interface IsochroneFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      resource: string;
      costType: string;
      costValue: number;
      profile: string;
      direction: string;
      crs: string;
    };
    geometry: {
      type: string;
      coordinates: unknown[];
    };
  }>;
}

interface IsochroneRequestPayload {
  result_type: "request";
  method: "GET";
  url: string;
  query: Record<string, string>;
  body: "";
  get_url: string;
}

describe("Isochrone Tool (integration)", () => {
  const { getHandle } = withMcpServer();

  it("should return a normalized GeoJSON FeatureCollection for a small Paris isodistance", async () => {
    const result = await callTool<IsochroneFeatureCollection>(getHandle().client, "isochrone", {
      lon: paris.lon,
      lat: paris.lat,
      cost_type: "distance",
      cost_value: 500,
    });

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].type).toBe("Feature");
    expect(result.features[0].geometry.type).toMatch(/Polygon/);
    expect(Array.isArray(result.features[0].geometry.coordinates)).toBe(true);
    expect(result.features[0].properties).toMatchObject({
      resource: "bdtopo-valhalla",
      costType: "distance",
      costValue: 500,
      profile: "pedestrian",
      direction: "departure",
      crs: "EPSG:4326",
    });
  }, INTEGRATION_CONFIG.timeout);

  it("should return a compact request payload without calling the upstream service", async () => {
    const result = await callTool<IsochroneRequestPayload>(getHandle().client, "isochrone", {
      lon: paris.lon,
      lat: paris.lat,
      cost_type: "time",
      cost_value: 900,
      result_type: "request",
    });

    expect(result).toMatchObject({
      result_type: "request",
      method: "GET",
      url: "https://data.geopf.fr/navigation/isochrone",
      body: "",
    });
    expect(result.query).toMatchObject({
      resource: "bdtopo-valhalla",
      costType: "time",
      costValue: "900",
      geometryFormat: "geojson",
    });
    expect(result.get_url).toContain("costType=time");
  }, INTEGRATION_CONFIG.timeout);

  it("should return an error for invalid cost type", async () => {
    await expectToolCallToThrow(callTool(getHandle().client, "isochrone", {
      lon: paris.lon,
      lat: paris.lat,
      cost_type: "duration",
      cost_value: 500,
    }));
  }, INTEGRATION_CONFIG.timeout);
});
