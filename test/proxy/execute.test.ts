import { describe, expect, it, vi } from "vitest";
import type { Collection } from "@ignfab/gpf-schema-store";

import { runGeometryFeatureQuery, runGeometryFeatureByIdQuery, type WfsClientLike, type TravelTimeResolver } from "../../src/proxy/execute";
import type { CompiledRequest } from "../../src/wfs/request";
import type { WfsFeatureCollectionResponse } from "../../src/wfs/types";
import type { GpfGetFeaturesInput } from "../../src/wfs/schema";
import { ServiceResponseError } from "../../src/helpers/http";

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

// A resolver stub for the non-travel_time cases: `resolveTravelTime` is a required
// dependency, but these queries must never invoke it — so this throws if they do,
// turning an accidental travel_time path into a loud test failure.
const unexpectedResolveTravelTime: TravelTimeResolver = () => {
  throw new Error("resolveTravelTime should not be called for a non-travel_time query");
};

describe("proxy/execute · runGeometryFeatureQuery", () => {
  it("returns the RAW FeatureCollection with geometry preserved", async () => {
    const { client } = makeClient();

    const result = await runGeometryFeatureQuery(baseInput, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });

    // Geometry, crs and geometry_name must survive (opposite of the LLM trim path).
    expect(result.features?.[0]?.geometry).toEqual(collectionWithGeometry.features?.[0]?.geometry);
    expect(result.features?.[0]?.geometry).not.toBeNull();
    expect((result as { crs?: unknown }).crs).toBeDefined();
    expect(result.features?.[0]?.geometry_name).toBe("geometrie");
  });

  it("forces the geometry column into propertyName when `select` is given", async () => {
    const { client, requests } = makeClient();

    await runGeometryFeatureQuery({ ...baseInput, select: ["code_insee"] }, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });

    const propertyName = requests[0].query.propertyName;
    expect(propertyName).toBeDefined();
    const columns = propertyName!.split(",");
    expect(columns).toContain("code_insee");
    expect(columns).toContain("geometrie"); // geometry appended
  });

  it("requests WGS84 EPSG:4326 (lon/lat convention)", async () => {
    const { client, requests } = makeClient();

    await runGeometryFeatureQuery(baseInput, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });

    // srsName lands on request.query, which the proxy transport serializes into the fetch URL.
    expect(requests[0].query.srsName).toBe("EPSG:4326");
  });

  it("includes the geometry column alongside all non-geometry props when no `select` is given", async () => {
    const { client, requests } = makeClient();

    await runGeometryFeatureQuery(baseInput, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });

    // With no select, compileQueryParts materializes the non-geometry columns;
    // the runner then appends the geometry column.
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
  ])("rejects an off-contract response (%s) as a 502, not a valid layer", async (_label, badResponse) => {
    const { client } = makeClient({ responses: [badResponse as unknown as WfsFeatureCollectionResponse] });
    const promise = runGeometryFeatureQuery(baseInput, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });
    // Now a ServiceResponseError(502) — an UPSTREAM anomaly — not a plain Error (which
    // server.ts would map to a misleading 500). Client still gets the generic phrase.
    await expect(promise).rejects.toMatchObject({ name: "ServiceResponseError", httpStatus: 502 });
    await expect(promise).rejects.toThrow(/FeatureCollection GeoJSON exploitable/);
  });

  it("traces the upstream cause of a 200-with-error-body in the (server-side) detail", async () => {
    const { client } = makeClient({
      responses: [{ exceptions: [{ code: "NoApplicableCode", text: "détail amont" }] } as unknown as WfsFeatureCollectionResponse],
    });
    // The client-facing message stays generic, but the internal (logged) message must
    // carry the extracted upstream cause so a 200-error-body is distinguishable from a
    // `{}` in the logs — the whole point of routing it through extractJsonServiceError.
    const promise = runGeometryFeatureQuery(baseInput, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });
    await expect(promise).rejects.toMatchObject({ name: "ServiceResponseError", httpStatus: 502 });
    await expect(promise).rejects.toThrow(/détail amont/);
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

    const result = await runGeometryFeatureQuery(input, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });

    expect(client.fetchFeatureCollection).toHaveBeenCalledTimes(2);
    expect(requests[1].body).toContain("INTERSECTS");
    expect(result.type).toBe("FeatureCollection");
  });

  it("resolves travel_time_filter via the injected isochrone resolver", async () => {
    const { client, requests } = makeClient();
    const resolveTravelTime = vi.fn(async () => ({
      geometry_ewkt: "SRID=4326;POLYGON((2 48,2.2 48,2.2 48.2,2 48))",
    }));
    const input: GpfGetFeaturesInput = {
      ...baseInput,
      travel_time_filter: { lon: 2.35, lat: 48.85, minutes: 15, profile: "pedestrian" },
    };

    const result = await runGeometryFeatureQuery(input, { wfsClient: client, resolveTravelTime });

    expect(resolveTravelTime).toHaveBeenCalledOnce();
    // The compiled main request carries an INTERSECTS predicate built from the isochrone.
    expect(requests[0].body).toContain("INTERSECTS");
    expect(result.type).toBe("FeatureCollection");
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

    const result = await runGeometryFeatureQuery(input, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime });

    // Two upstream fetches: reference-by-id, then the main query.
    expect(client.fetchFeatureCollection).toHaveBeenCalledTimes(2);
    // The by-id request targets the reference typename with its geometry column.
    expect(requests[0].query.typeNames).toBe("ADMINEXPRESS-COG.LATEST:departement");
    expect(requests[0].query.featureID).toBe("departement.25");
    // The main request carries an INTERSECTS predicate compiled from the resolved geometry.
    expect(requests[1].body).toContain("INTERSECTS");
    expect(result.features?.[0]?.geometry).not.toBeNull();
  });

  it("rewrites an 'Illegal property name: <geom>' upstream error into a catalog-desync diagnostic", async () => {
    // The proxy forces the embedded catalog's geometry column into the request, so a
    // live WFS that uses a different geom name for this type rejects it. That opaque
    // upstream string must become a clear "catalogue désynchronisé" message.
    const client: WfsClientLike = {
      getFeatureType: vi.fn(async () => communeType),
      fetchFeatureCollection: vi.fn(async () => {
        throw new ServiceResponseError("Illegal property name: geometrie", {
          http: { status: 400, statusText: "Bad Request" },
          service: { code: "InvalidParameterValue", detail: "Illegal property name: geometrie" },
        });
      }),
    };

    await expect(
      runGeometryFeatureQuery(baseInput, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime }),
    ).rejects.toThrow(/catalogue embarqué est probablement désynchronisé/);
  });

  it("rethrows an unrelated ServiceResponseError unchanged (not a desync)", async () => {
    const upstream = new ServiceResponseError("boom", {
      http: { status: 502, statusText: "Bad Gateway" },
      service: { code: "SomethingElse", detail: "not a geometry issue" },
    });
    const client: WfsClientLike = {
      getFeatureType: vi.fn(async () => communeType),
      fetchFeatureCollection: vi.fn(async () => {
        throw upstream;
      }),
    };

    // Must propagate as-is (same instance), so server.ts maps it to 502 — not be
    // swallowed by the desync branch nor rewritten.
    await expect(
      runGeometryFeatureQuery(baseInput, { wfsClient: client, resolveTravelTime: unexpectedResolveTravelTime }),
    ).rejects.toBe(upstream);
  });
});

describe("proxy/execute · runGeometryFeatureByIdQuery", () => {
  const byIdInput = { typename: "ADMINEXPRESS-COG.LATEST:commune", feature_id: "commune.1" };

  it("returns the RAW single-feature collection with geometry preserved", async () => {
    const { client, requests } = makeClient();

    const result = await runGeometryFeatureByIdQuery(byIdInput, { wfsClient: client });

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(result.features?.[0]?.geometry).toBeTruthy();
    expect(result.numberReturned).toBe(1);

    // No `propertyName` is sent (WFS returns all props incl. geometry); srsName is
    // forced to WGS84 like the query path.
    expect(requests).toHaveLength(1);
    expect(requests[0].query.propertyName).toBeUndefined();
    expect(requests[0].query.featureID).toBe("commune.1");
    expect(requests[0].query.srsName).toBe("EPSG:4326");
  });

  it("validates select and appends the geometry column to propertyName", async () => {
    const { client, requests } = makeClient();

    await runGeometryFeatureByIdQuery(
      { ...byIdInput, select: ["code_insee"] },
      { wfsClient: client },
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].query.propertyName).toBe("code_insee,geometrie");
  });

  it("rejects an unknown selected property before calling the WFS", async () => {
    const { client, requests } = makeClient();

    await expect(
      runGeometryFeatureByIdQuery(
        { ...byIdInput, select: ["propriete_inconnue"] },
        { wfsClient: client },
      ),
    ).rejects.toThrow(/n'existe pas/);

    expect(requests).toHaveLength(0);
  });

  it("rejects the geometry property in select before calling the WFS", async () => {
    const { client, requests } = makeClient();

    await expect(
      runGeometryFeatureByIdQuery(
        { ...byIdInput, select: ["geometrie"] },
        { wfsClient: client },
      ),
    ).rejects.toThrow(/non géométriques/);

    expect(requests).toHaveLength(0);
  });

  it("throws a clear cardinality error when the feature is not found (0 results)", async () => {
    const empty: WfsFeatureCollectionResponse = {
      type: "FeatureCollection",
      features: [],
      numberMatched: 0,
      numberReturned: 0,
    } as unknown as WfsFeatureCollectionResponse;
    const { client } = makeClient({ responses: [empty] });

    await expect(
      runGeometryFeatureByIdQuery({ typename: "ADMINEXPRESS-COG.LATEST:commune", feature_id: "commune.404" }, { wfsClient: client }),
    ).rejects.toThrow(/introuvable/);
  });

  it("throws a uniqueness error when more than one feature is returned", async () => {
    const twoFeatures: WfsFeatureCollectionResponse = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "commune.1", geometry: { type: "Point", coordinates: [2, 48] }, properties: {} },
        { type: "Feature", id: "commune.1", geometry: { type: "Point", coordinates: [2, 48] }, properties: {} },
      ],
      numberMatched: 2,
      numberReturned: 2,
    } as unknown as WfsFeatureCollectionResponse;
    const { client } = makeClient({ responses: [twoFeatures] });

    await expect(
      runGeometryFeatureByIdQuery(byIdInput, { wfsClient: client }),
    ).rejects.toThrow(/devrait être unique/);
  });

  it("rejects an off-contract 200 body (not a FeatureCollection) as a 502", async () => {
    const bad = { error: "boom" } as unknown as WfsFeatureCollectionResponse;
    const { client } = makeClient({ responses: [bad] });

    const promise = runGeometryFeatureByIdQuery(byIdInput, { wfsClient: client });
    await expect(promise).rejects.toMatchObject({ name: "ServiceResponseError", httpStatus: 502 });
    await expect(promise).rejects.toThrow(/FeatureCollection GeoJSON exploitable/);
  });
});
