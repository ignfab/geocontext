import { vi, describe, it, expect, afterEach } from "vitest";

import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";

const mockGetFeatureType = vi.fn<(typename: string) => Promise<OgcCollectionSchema>>();
const mockFetchJSONPost = vi.fn<(
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<unknown>>();
const mockFetchJSONGet = vi.fn<(url: string) => Promise<unknown>>();

vi.doMock("../../../src/wfs/catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsSchemaStore: {
    getFeatureType: mockGetFeatureType,
  },
}));

vi.doMock("../../../src/helpers/http.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/helpers/http.js")>(
    "../../../src/helpers/http.js",
  );

  return {
    ...actual,
    fetchJSONGet: mockFetchJSONGet,
    fetchJSONPost: mockFetchJSONPost,
  };
});

const { default: GpfCountFeaturesTool } = await import(
  "../../../src/tools/GpfCountFeaturesTool"
);

describe("Test GpfCountFeaturesTool", () => {
  class RespondableGpfCountFeaturesTool extends GpfCountFeaturesTool {
    respond(data: {numberMatched: number}) {
      return this.createSuccessResponse(data);
    }
  }

  const polygonFeatureType: OgcCollectionSchema = {
    id: "ADMINEXPRESS-COG.LATEST:commune",
    namespace: "ADMINEXPRESS-COG.LATEST",
    name: "commune",
    title: "Commune",
    description: "Description de test",
    properties: [
      { name: "code_insee", type: "string" },
      { name: "population", type: "integer" },
      { name: "actif", type: "boolean" },
      { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
    ],
  };

  function mockFeatureTypes(featureTypes: Record<string, OgcCollectionSchema>) {
    mockGetFeatureType.mockImplementation(async (typename: string) => {
      const featureType = featureTypes[typename];
      if (!featureType) {
        throw new Error(`unexpected typename ${typename}`);
      }
      return featureType;
    });
  }

  function captureRequests(responseData: unknown) {
    const requests: Array<{
      url: string;
      query: Record<string, string>;
      body: string;
    }> = [];

    mockFetchJSONPost.mockImplementation(async (url, body) => {
      const [baseUrl, queryString = ""] = url.split("?");
      requests.push({
        url: baseUrl,
        query: Object.fromEntries(new URLSearchParams(queryString).entries()),
        body: body ?? "",
      });
      return responseData;
    });

    return requests;
  }

  function captureIsochroneRequests() {
    const urls: string[] = [];
    mockFetchJSONGet.mockImplementation(async (url) => {
      urls.push(url);
      return {
        geometry: {
          type: "Polygon",
          coordinates: [
            [[2, 48], [2.2, 48], [2.2, 48.2], [2, 48]],
          ],
        },
      };
    });
    return urls;
  }

  afterEach(() => {
    vi.clearAllMocks();
    mockGetFeatureType.mockReset();
    mockFetchJSONGet.mockReset();
    mockFetchJSONPost.mockReset();
  });

  it("should return text content and structuredContent for counts", () => {
    const tool = new RespondableGpfCountFeaturesTool();
    const response = tool.respond({
      numberMatched: 34877,
    });

    expect("isError" in response).toBe(false);
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(JSON.parse(textContent.text)).toEqual({ numberMatched: 34877 });
    expect(response.structuredContent).toEqual({ numberMatched: 34877 });
  });

  it("should apply travel_time_filter before returning the count", async () => {
    const tool = new GpfCountFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    captureIsochroneRequests();
    const requests = captureRequests({ numberMatched: 12 });

    const response = await tool.toolCall({
      params: {
        name: "gpf_count_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          travel_time_filter: {
            lon: 2.337306,
            lat: 48.849319,
            minutes: 5,
            profile: "car",
          },
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0].query.count).toEqual("1");
    expect(requests[0].query.propertyName).toBeUndefined();
    expect(new URLSearchParams(requests[0].body).get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POLYGON((2 48,2.2 48,2.2 48.2,2 48)))",
    );
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(JSON.parse(textContent.text)).toEqual({
      numberMatched: 12,
    });
  });

  it.each([
    { kind: "absent", mockResponse: {}, errorMessage: "n'a pas retourné de comptage exploitable dans `numberMatched`"},
    { kind: "wrong", mockResponse: { numberMatched: "unknown" }, errorMessage: 'numberMatched="unknown"'}
  ])("should fail clearly when numberMatched is $kind", async ({mockResponse, errorMessage}) => {
    const tool = new GpfCountFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    captureRequests(mockResponse);

    const response = await tool.toolCall({
      params: {
        name: "gpf_count_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain(errorMessage);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });
});