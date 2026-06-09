import { vi, describe, expect, afterEach, it } from "vitest";
import type { Collection } from "@ignfab/gpf-schema-store";
import { getMatchedFeatureCount } from "../../src/wfs/response.js";

const mockPost = vi.fn<(request: any) => Promise<unknown>>();
const mockGetFeatureType = vi.fn<(typename: string) => Promise<unknown>>();

vi.doMock("../../src/wfs/transport.js", () => ({
  WfsTransport: class {
    post = mockPost;
  },
}));

vi.doMock("../../src/wfs/catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsSchemaStore: {
    getFeatureType: mockGetFeatureType,
  },
}));

const {
  WfsClient,
  wfsClient,
} = await import("../../src/wfs/execution");

describe("WfsClient", () => {
  afterEach(() => {
    mockPost.mockReset();
    mockGetFeatureType.mockReset();
  });

  it("should execute multi-typename requests and preserve per-typename cql_filters", async () => {
    mockPost.mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });

    const response = await wfsClient.fetchMultiTypename({
      typenames: [
        "ADMINEXPRESS-COG.LATEST:commune",
        "ADMINEXPRESS-COG.LATEST:departement",
      ],
      cqlFilters: [
        "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
        "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85)) AND code_insee = '25'",
      ],
      errorLabel: "ADMINEXPRESS",
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const request = mockPost.mock.calls[0]?.[0];
    if (!request) {
      throw new Error("missing request");
    }

    expect(request.url).toEqual("https://data.geopf.fr/wfs");
    expect(request.query.service).toEqual("WFS");
    expect(request.query.version).toEqual("2.0.0");
    expect(request.query.request).toEqual("GetFeature");
    expect(request.query.typeNames).toEqual(
      "(ADMINEXPRESS-COG.LATEST:commune)(ADMINEXPRESS-COG.LATEST:departement)",
    );
    expect(request.query.srsName).toEqual("EPSG:4326");
    expect(request.query.outputFormat).toEqual("application/json");
    expect(request.query.exceptions).toEqual("application/json");
    expect(request.query.cql_filter).toBeUndefined();

    const parsedBody = new URLSearchParams(request.body);
    expect(parsedBody.get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85));INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85)) AND code_insee = '25'",
    );

    expect(response).toMatchObject({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("should fail when multi-typename response has no features array", async () => {
    mockPost.mockResolvedValue({
      type: "FeatureCollection",
      totalFeatures: 12,
    });

    await expect(wfsClient.fetchMultiTypename({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: "code_insee = '94080'",
      errorLabel: "ADMINEXPRESS",
    })).rejects.toThrow(
      "Le service ADMINEXPRESS n'a pas retourné de collection d'objets exploitable",
    );
  });

  it("should reject cqlFilters length mismatch before executing HTTP", async () => {
    await expect(wfsClient.fetchMultiTypename({
      typenames: [
        "ADMINEXPRESS-COG.LATEST:commune",
        "ADMINEXPRESS-COG.LATEST:departement",
      ],
      cqlFilters: [
        "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
      ],
      errorLabel: "ADMINEXPRESS",
    })).rejects.toThrow("Le nombre de filtres CQL");

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("should accept structural test doubles as dependencies", async () => {
    const featureType: Collection = {
      id: "BDTOPO_V3:batiment",
      namespace: "BDTOPO_V3",
      name: "batiment",
      title: "Batiment",
      description: "Description de test",
      properties: [
        { name: "cleabs", type: "string" },
        { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
      ],
    };
    const post = vi.fn(async () => ({
      type: "FeatureCollection",
      features: [],
    }));
    const getFeatureType = vi.fn(async () => featureType);

    const client = new WfsClient(
      { post },
      { getFeatureType },
    );

    await expect(client.getFeatureType("BDTOPO_V3:batiment")).resolves.toEqual(featureType);
    await expect(client.fetchFeatureCollection({
      method: "POST",
      url: "https://data.geopf.fr/wfs",
      query: { service: "WFS" },
      body: "",
      get_url: "https://data.geopf.fr/wfs?service=WFS",
    })).resolves.toMatchObject({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("should extract matched count from numberMatched", () => {
    expect(getMatchedFeatureCount({ numberMatched: 42 })).toEqual(42);
  });

  it("should reject unknown, legacy-only, or missing matched count", () => {
    expect(() => getMatchedFeatureCount({ numberMatched: "unknown" })).toThrow(
      "numberMatched=\"unknown\"",
    );
    expect(() => getMatchedFeatureCount({ totalFeatures: 11 })).toThrow(
      "n'a pas retourné de comptage exploitable dans `numberMatched`",
    );
    expect(() => getMatchedFeatureCount({})).toThrow(
      "n'a pas retourné de comptage exploitable dans `numberMatched`",
    );
  });
});
