import { describe, expect, it, vi } from "vitest";
import type { Collection } from "@ignfab/gpf-schema-store";

import { runGeometryFeatureQuery, type WfsClientLike } from "../../src/proxy/execute";
import type { CompiledRequest } from "../../src/wfs/request";
import type { WfsFeatureCollectionResponse } from "../../src/wfs/types";
import type { GpfGetFeaturesInput } from "../../src/wfs/schema";

// --- Test catalog ---

const communeType: Collection = {
  id: "ADMINEXPRESS-COG.LATEST:commune",
  namespace: "ADMINEXPRESS-COG.LATEST",
  name: "commune",
  title: "Commune",
  description: "Test feature type",
  properties: [
    { name: "code_insee", type: "string" },
    { name: "population", type: "integer" },
    { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
  ],
};

const departementType: Collection = {
  id: "ADMINEXPRESS-COG.LATEST:departement",
  namespace: "ADMINEXPRESS-COG.LATEST",
  name: "departement",
  title: "Département",
  description: "Test reference feature type",
  properties: [
    { name: "code_insee", type: "string" },
    { name: "geom", type: "multipolygon", defaultCrs: "EPSG:4326" },
  ],
};

// A feature collection WITH geometry, as the live WFS returns it.
const collectionWithGeometry: WfsFeatureCollectionResponse = {
  type: "FeatureCollection",
  crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
  numberMatched: 1,
  numberReturned: 1,
  features: [
    {
      type: "Feature",
      id: "commune.1",
      geometry: { type: "MultiPolygon", coordinates: [[[[2, 48], [2.2, 48], [2.2, 48.2], [2, 48]]]] },
      geometry_name: "geometrie",
      properties: { code_insee: "94080" },
    },
  ],
} as unknown as WfsFeatureCollectionResponse;

const baseInput: GpfGetFeaturesInput = {
  typename: "ADMINEXPRESS-COG.LATEST:commune",
  limit: 100,
  result_type: "results",
  spatial_extras: [],
};

/** Builds a WfsClientLike double, recording the requests it executes. */
function makeClient(overrides?: {
  featureTypes?: Record<string, Collection>;
  responses?: WfsFeatureCollectionResponse[];
}) {
  const featureTypes = overrides?.featureTypes ?? {
    "ADMINEXPRESS-COG.LATEST:commune": communeType,
  };
  const responses = overrides?.responses ?? [collectionWithGeometry];
  const requests: CompiledRequest[] = [];
  let call = 0;

  const client: WfsClientLike = {
    getFeatureType: vi.fn(async (typename: string) => {
      const found = featureTypes[typename];
      if (!found) throw new Error(`unknown typename ${typename}`);
      return found;
    }),
    fetchFeatureCollection: vi.fn(async (request: CompiledRequest) => {
      requests.push(request);
      return responses[Math.min(call++, responses.length - 1)];
    }),
  };

  return { client, requests };
}

describe("proxy/execute · runGeometryFeatureQuery", () => {
  it("returns the RAW FeatureCollection with geometry preserved", async () => {
    const { client } = makeClient();

    const result = await runGeometryFeatureQuery(baseInput, client);

    // Geometry, crs and geometry_name must survive (opposite of the LLM trim path).
    expect(result.features?.[0]?.geometry).toEqual(collectionWithGeometry.features?.[0]?.geometry);
    expect(result.features?.[0]?.geometry).not.toBeNull();
    expect((result as { crs?: unknown }).crs).toBeDefined();
    expect(result.features?.[0]?.geometry_name).toBe("geometrie");
  });

  it("forces the geometry column into propertyName when `select` is given", async () => {
    const { client, requests } = makeClient();

    await runGeometryFeatureQuery({ ...baseInput, select: ["code_insee"] }, client);

    const propertyName = requests[0].query.propertyName;
    expect(propertyName).toBeDefined();
    const columns = propertyName!.split(",");
    expect(columns).toContain("code_insee");
    expect(columns).toContain("geometrie"); // geometry appended
  });

  it("requests WGS84 EPSG:4326 (lon/lat convention)", async () => {
    const { client, requests } = makeClient();

    await runGeometryFeatureQuery(baseInput, client);

    expect(requests[0].query.srsName).toBe("EPSG:4326");
    expect(requests[0].get_url).toContain("srsName");
  });

  it("includes the geometry column alongside all non-geometry props when no `select` is given", async () => {
    const { client, requests } = makeClient();

    await runGeometryFeatureQuery(baseInput, client);

    // With result_type "results" and no select, compileQueryParts materializes the
    // non-geometry columns; the runner then appends the geometry column.
    const columns = requests[0].query.propertyName!.split(",");
    expect(columns).toContain("code_insee");
    expect(columns).toContain("population");
    expect(columns).toContain("geometrie");
  });

  it.each([
    ["an HTTP-200 error body", { exceptions: [{ text: "boom" }] }],
    ["an empty object", {}],
    ["a non-array features field", { type: "FeatureCollection", features: "nope" }],
    ["a missing type", { features: [] }],
  ])("rejects an off-contract response (%s) instead of serving it as a layer", async (_label, badResponse) => {
    const { client } = makeClient({ responses: [badResponse as unknown as WfsFeatureCollectionResponse] });
    await expect(runGeometryFeatureQuery(baseInput, client)).rejects.toThrow(/FeatureCollection GeoJSON exploitable/);
  });

  it("allows a same-typename intersects_feature (diverges from the LLM path)", async () => {
    // The MCP flow rejects same-typename intersects_feature (steer to
    // gpf_get_feature_by_id); the proxy allows it, as "feature X + same-type
    // neighbours" is a valid map layer. This pins that divergence.
    const referenceCollection: WfsFeatureCollectionResponse = {
      type: "FeatureCollection",
      numberMatched: 1,
      numberReturned: 1,
      features: [
        {
          type: "Feature",
          id: "commune.1",
          geometry: { type: "MultiPolygon", coordinates: [[[[2, 48], [2.2, 48], [2.2, 48.2], [2, 48]]]] },
        },
      ],
    } as unknown as WfsFeatureCollectionResponse;

    const { client, requests } = makeClient({
      responses: [referenceCollection, collectionWithGeometry],
    });

    const input: GpfGetFeaturesInput = {
      ...baseInput,
      // Same typename as the query target — rejected by the MCP guard, allowed here.
      intersects_feature_filter: {
        typename: "ADMINEXPRESS-COG.LATEST:commune",
        feature_id: "commune.1",
      },
    };

    const result = await runGeometryFeatureQuery(input, client);

    expect(client.fetchFeatureCollection).toHaveBeenCalledTimes(2);
    expect(requests[1].body).toContain("INTERSECTS");
    expect(result.type).toBe("FeatureCollection");
  });

  it("fails explicitly for travel_time_filter (isochrone resolver not wired yet)", async () => {
    // Guard until commit 3 injects the isochrone resolver; without it the request
    // would otherwise fail deep inside compileQueryParts with a confusing message.
    const { client } = makeClient();
    const input: GpfGetFeaturesInput = {
      ...baseInput,
      travel_time_filter: { lon: 2.35, lat: 48.85, minutes: 15, profile: "pedestrian" },
    };
    await expect(runGeometryFeatureQuery(input, client)).rejects.toThrow(/travel_time_filter/);
    // The guard must fire before any upstream call.
    expect(client.fetchFeatureCollection).not.toHaveBeenCalled();
  });

  it("resolves the reference geometry for intersects_feature (a second upstream call)", async () => {
    const referenceCollection: WfsFeatureCollectionResponse = {
      type: "FeatureCollection",
      numberMatched: 1,
      numberReturned: 1,
      features: [
        {
          type: "Feature",
          id: "departement.25",
          geometry: { type: "MultiPolygon", coordinates: [[[[6, 47], [6.5, 47], [6.5, 47.5], [6, 47]]]] },
        },
      ],
    } as unknown as WfsFeatureCollectionResponse;

    const { client, requests } = makeClient({
      featureTypes: {
        "ADMINEXPRESS-COG.LATEST:commune": communeType,
        "ADMINEXPRESS-COG.LATEST:departement": departementType,
      },
      // 1st fetch = reference feature (by id), 2nd fetch = the main query.
      responses: [referenceCollection, collectionWithGeometry],
    });

    const input: GpfGetFeaturesInput = {
      ...baseInput,
      intersects_feature_filter: {
        typename: "ADMINEXPRESS-COG.LATEST:departement",
        feature_id: "departement.25",
      },
    };

    const result = await runGeometryFeatureQuery(input, client);

    // Two upstream fetches: reference-by-id, then the main query.
    expect(client.fetchFeatureCollection).toHaveBeenCalledTimes(2);
    // The by-id request targets the reference typename with its geometry column.
    expect(requests[0].query.typeNames).toBe("ADMINEXPRESS-COG.LATEST:departement");
    expect(requests[0].query.featureID).toBe("departement.25");
    // The main request carries an INTERSECTS predicate compiled from the resolved geometry.
    expect(requests[1].body).toContain("INTERSECTS");
    expect(result.features?.[0]?.geometry).not.toBeNull();
  });
});
