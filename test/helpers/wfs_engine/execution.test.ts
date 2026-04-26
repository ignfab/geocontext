import { vi } from "vitest";

const mockFetchJSONPost = vi.fn<(
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<unknown>>();
const mockGetFeatureType = vi.fn<(typename: string) => Promise<unknown>>();

vi.doMock("../../../src/helpers/http.js", () => ({
  fetchJSONPost: mockFetchJSONPost,
}));

vi.doMock("../../../src/gpf/wfs-schema-catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsClient: {
    getFeatureType: mockGetFeatureType,
  },
}));

const {
  fetchWfsMultiTypename,
  getMatchedFeatureCount,
} = await import("../../../src/helpers/wfs_engine/execution");

describe("wfs_engine/execution", () => {
  afterEach(() => {
    mockFetchJSONPost.mockReset();
    mockGetFeatureType.mockReset();
  });

  it("should execute multi-typename requests as POST and preserve per-typename cql_filters", async () => {
    mockFetchJSONPost.mockResolvedValue({
      type: "FeatureCollection",
      features: [],
    });

    const response = await fetchWfsMultiTypename({
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

    expect(mockFetchJSONPost).toHaveBeenCalledTimes(1);
    const requestedUrl = mockFetchJSONPost.mock.calls[0]?.[0];
    if (!requestedUrl) {
      throw new Error("missing requested URL");
    }
    const requestedBody = mockFetchJSONPost.mock.calls[0]?.[1];
    const requestedHeaders = mockFetchJSONPost.mock.calls[0]?.[2];

    const parsedUrl = new URL(requestedUrl);
    expect(parsedUrl.origin + parsedUrl.pathname).toEqual("https://data.geopf.fr/wfs");
    expect(parsedUrl.searchParams.get("service")).toEqual("WFS");
    expect(parsedUrl.searchParams.get("version")).toEqual("2.0.0");
    expect(parsedUrl.searchParams.get("request")).toEqual("GetFeature");
    expect(parsedUrl.searchParams.get("typeNames")).toEqual(
      "(ADMINEXPRESS-COG.LATEST:commune)(ADMINEXPRESS-COG.LATEST:departement)",
    );
    expect(parsedUrl.searchParams.get("srsName")).toEqual("EPSG:4326");
    expect(parsedUrl.searchParams.get("outputFormat")).toEqual("application/json");
    expect(parsedUrl.searchParams.get("exceptions")).toEqual("application/json");
    expect(parsedUrl.searchParams.get("cql_filter")).toBeNull();

    const parsedBody = new URLSearchParams(requestedBody);
    expect(parsedBody.get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85));INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85)) AND code_insee = '25'",
    );
    expect(requestedHeaders).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    });

    expect(response).toMatchObject({
      type: "FeatureCollection",
      features: [],
    });
  });

  it("should fail when multi-typename response has no features array", async () => {
    mockFetchJSONPost.mockResolvedValue({
      type: "FeatureCollection",
      totalFeatures: 12,
    });

    await expect(fetchWfsMultiTypename({
      typenames: ["ADMINEXPRESS-COG.LATEST:commune"],
      cqlFilter: "code_insee = '94080'",
      errorLabel: "ADMINEXPRESS",
    })).rejects.toThrow(
      "Le service ADMINEXPRESS n'a pas retourné de collection d'objets exploitable",
    );
  });

  it("should reject cqlFilters length mismatch before executing HTTP", async () => {
    await expect(fetchWfsMultiTypename({
      typenames: [
        "ADMINEXPRESS-COG.LATEST:commune",
        "ADMINEXPRESS-COG.LATEST:departement",
      ],
      cqlFilters: [
        "INTERSECTS(geometrie,SRID=4326;POINT(2.35 48.85))",
      ],
      errorLabel: "ADMINEXPRESS",
    })).rejects.toThrow("Le nombre de filtres CQL");

    expect(mockFetchJSONPost).not.toHaveBeenCalled();
  });

  it("should extract matched count from numberMatched then fallback to totalFeatures", () => {
    expect(getMatchedFeatureCount({ numberMatched: 42 })).toEqual(42);
    expect(getMatchedFeatureCount({ totalFeatures: 11 })).toEqual(11);
  });

  it("should reject unknown or missing matched count", () => {
    expect(() => getMatchedFeatureCount({ numberMatched: "unknown" })).toThrow(
      "numberMatched=\"unknown\"",
    );
    expect(() => getMatchedFeatureCount({})).toThrow(
      "n'a pas retourné de comptage exploitable",
    );
  });
});
