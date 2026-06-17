import { vi, describe, it, expect, afterEach } from "vitest";

import type { Collection } from "@ignfab/gpf-schema-store";
import { ServiceResponseError } from "../../../src/helpers/http.js";

const mockGetFeatureType = vi.fn<(typename: string) => Promise<Collection>>();
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

vi.doMock("../../../src/helpers/http.js", () => ({
  fetchJSONGet: mockFetchJSONGet,
  fetchJSONPost: mockFetchJSONPost,
  ServiceResponseError,
}));

const { default: GpfWfsGetFeaturesTool } = await import(
  "../../../src/tools/GpfWfsGetFeaturesTool"
);

describe("Test GpfWfsGetFeaturesTool", () => {
  class RespondableGpfWfsGetFeaturesTool extends GpfWfsGetFeaturesTool {
    respond(data: unknown) {
      return this.createSuccessResponse(data);
    }
  }

  const polygonFeatureType: Collection = {
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

  const pointFeatureType: Collection = {
    id: "BDTOPO_V3:point_d_acces",
    namespace: "BDTOPO_V3",
    name: "point_d_acces",
    title: "Point d'acces",
    description: "Description de test",
    properties: [
      { name: "cleabs", type: "string" },
      { name: "geometrie", type: "point", defaultCrs: "EPSG:4326" },
    ],
  };

  const multipointFeatureType: Collection = {
    id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant",
    namespace: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS",
    name: "localisant",
    title: "Localisant",
    description: "Description de test",
    properties: [
      { name: "gid", type: "integer" },
      { name: "idu", type: "string" },
      { name: "geometrie", type: "multipoint", defaultCrs: "EPSG:4326" },
    ],
  };

  const featureCollection: {
    type: string;
    features: Array<{
      type: string;
      id: string;
      geometry: null;
      properties: {
        code_insee: string;
      };
    }>;
    totalFeatures: number;
  } = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "commune.1",
        geometry: null,
        properties: {
          code_insee: "01001",
        },
      },
    ],
    totalFeatures: 34877,
  };

  function mockFeatureTypes(featureTypes: Record<string, Collection>) {
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

  function hasJsonSchemaComposition(value: unknown): boolean {
    if (!value || typeof value !== "object") {
      return false;
    }
    if ("anyOf" in value || "oneOf" in value || "allOf" in value) {
      return true;
    }
    return Object.values(value).some(hasJsonSchemaComposition);
  }

  afterEach(() => {
    vi.clearAllMocks();
    mockGetFeatureType.mockReset();
    mockFetchJSONGet.mockReset();
    mockFetchJSONPost.mockReset();
  });

  it("should expose an enriched MCP definition", () => {
    const tool = new GpfWfsGetFeaturesTool();
    expect(tool.toolDefinition.title).toEqual("Lecture d’objets WFS");
    expect(tool.toolDefinition.inputSchema.properties?.typename).toMatchObject({
      type: "string",
      minLength: 1,
    });
    expect(tool.toolDefinition.inputSchema.properties?.limit).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 5000,
    });
    expect(tool.toolDefinition.inputSchema.properties?.select).toMatchObject({
      type: "array",
    });
    expect(tool.toolDefinition.inputSchema.properties?.order_by).toMatchObject({
      type: "array",
    });
    expect(tool.toolDefinition.inputSchema.properties?.where).toMatchObject({
      type: "array",
    });
    expect(tool.toolDefinition.outputSchema).toBeUndefined();
  });

  it("should publish an LLM-compatible input schema without composition keywords", () => {
    const tool = new GpfWfsGetFeaturesTool();

    expect(hasJsonSchemaComposition(tool.toolDefinition.inputSchema)).toBe(false);
    expect(tool.toolDefinition.inputSchema.properties?.dwithin_point_filter).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        lon: expect.objectContaining({ type: "number" }),
        lat: expect.objectContaining({ type: "number" }),
        distance_m: expect.objectContaining({ type: "number" }),
      }),
    });
    expect(tool.toolDefinition.inputSchema.properties?.travel_time_filter).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        lon: expect.objectContaining({ type: "number" }),
        lat: expect.objectContaining({ type: "number" }),
        minutes: expect.objectContaining({ type: "number", maximum: 120 }),
        profile: expect.objectContaining({ enum: ["car", "pedestrian"] }),
      }),
    });
  });

  it("should return a FeatureCollection without structuredContent for results", () => {
    const tool = new RespondableGpfWfsGetFeaturesTool();
    const response = tool.respond(featureCollection as never);

    expect("isError" in response).toBe(false);
    expect(response.structuredContent).toBeUndefined();
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(JSON.parse(textContent.text)).toMatchObject({
      type: "FeatureCollection",
      features: expect.any(Array),
    });
  });

  it("should return text content and structuredContent for hits", () => {
    const tool = new RespondableGpfWfsGetFeaturesTool();
    const response = tool.respond({
      result_type: "hits",
      totalFeatures: featureCollection.totalFeatures,
    } as never);

    expect("isError" in response).toBe(false);
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(JSON.parse(textContent.text)).toMatchObject({
      result_type: "hits",
      totalFeatures: expect.any(Number),
    });
    expect(response.structuredContent).toMatchObject({
      result_type: "hits",
      totalFeatures: expect.any(Number),
    });
  });

  it("should return text content and structuredContent for http_post_request", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "http_post_request",
          select: ["code_insee"],
          where: [
            {
              property: "code_insee",
              operator: "eq",
              value: "01001",
            },
          ],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(payload).toEqual(response.structuredContent);
    expect(payload.result_type).toEqual("http_post_request");
    expect(payload.http_get_url).toBeUndefined();
    expect(payload.http_post_request).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: expect.stringContaining("cql_filter="),
    });
    const url = new URL(payload.http_post_request.url);
    expect(url.origin + url.pathname).toEqual("https://data.geopf.fr/wfs");
    expect(url.searchParams.get("service")).toEqual("WFS");
    expect(url.searchParams.get("exceptions")).toEqual("application/json");
    expect(url.searchParams.get("propertyName")).toEqual("code_insee,geometrie");
    expect(url.searchParams.get("cql_filter")).toBeNull();
  });

  it("should return text content and structuredContent for http_get_url", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "http_get_url",
          select: ["code_insee"],
          where: [
            {
              property: "code_insee",
              operator: "eq",
              value: "01001",
            },
          ],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(payload).toEqual(response.structuredContent);
    expect(payload).toMatchObject({
      result_type: "http_get_url",
      http_get_url: expect.stringContaining("https://data.geopf.fr/wfs?"),
    });
    expect(payload.http_post_request).toBeUndefined();
    const url = new URL(payload.http_get_url);
    expect(url.searchParams.get("propertyName")).toEqual("code_insee,geometrie");
    expect(url.searchParams.get("cql_filter")).toContain("code_insee = '01001'");
  });

  it("should compile travel_time_filter into a WFS request using an isochrone geometry", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    const isochroneUrls = captureIsochroneRequests();

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "http_post_request",
          travel_time_filter: {
            lon: 2.337306,
            lat: 48.849319,
            minutes: 15,
            profile: "pedestrian",
          },
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(isochroneUrls).toHaveLength(1);
    const isochroneUrl = new URL(isochroneUrls[0]);
    expect(isochroneUrl.searchParams.get("resource")).toEqual("bdtopo-valhalla");
    expect(isochroneUrl.searchParams.get("costType")).toEqual("time");
    expect(isochroneUrl.searchParams.get("costValue")).toEqual("15");
    expect(isochroneUrl.searchParams.get("profile")).toEqual("pedestrian");

    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(new URLSearchParams(payload.http_post_request.body).get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POLYGON((2 48,2.2 48,2.2 48.2,2 48)))",
    );
    expect(mockFetchJSONPost).not.toHaveBeenCalled();
  });

  it("should return isError=true for invalid input", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]).toMatchObject({
      type: "text",
    });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("Paramètres invalides");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "typename",
          code: "too_small",
          detail: "le nom du type ne doit pas être vide",
        }),
      ]),
    });
  });

  it("should reject legacy request result_type", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "request",
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "result_type",
          code: "invalid_enum_value",
          detail: expect.stringContaining("http_post_request"),
        }),
      ]),
    });
  });

  it("should reject geometry_keep with hits result_type", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "hits",
          geometry_keep: ["bbox"],
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("geometry_keep");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "geometry_keep",
          code: "custom",
        }),
      ]),
    });
    expect(mockGetFeatureType).not.toHaveBeenCalled();
    expect(mockFetchJSONPost).not.toHaveBeenCalled();
  });

  it("should reject multiple spatial filters as invalid tool parameters", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          bbox_filter: {
            west: 2.1,
            south: 48.7,
            east: 2.5,
            north: 48.9,
          },
          intersects_point_filter: {
            lon: 2.3,
            lat: 48.8,
          },
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("Paramètres invalides");
    expect(textContent.text).toContain("Un seul filtre spatial est autorisé");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "custom",
          name: "spatial_filters",
          detail: expect.stringContaining("bbox_filter, intersects_point_filter"),
        }),
      ]),
    });
    expect(mockGetFeatureType).not.toHaveBeenCalled();
    expect(mockFetchJSONPost).not.toHaveBeenCalled();
  });

  it("should reject legacy inputs removed from the public schema", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          cql_filter: "code_insee = '01001'",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("Paramètres invalides");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_parameter",
          name: "cql_filter",
          detail: expect.stringContaining("cql_filter"),
        }),
      ]),
    });
  });

  it("should build a POST request with query params and encoded body", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    const requests = captureRequests(featureCollection);

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          limit: 7,
          select: ["code_insee", "population"],
          order_by: [{ property: "population", direction: "desc" }],
          where: [{ property: "code_insee", operator: "eq", value: "01001" }],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0].query.exceptions).toEqual("application/json");
    expect(requests[0].query.count).toEqual("7");
    expect(requests[0].query.propertyName).toEqual("code_insee,population");
    expect(requests[0].query.sortBy).toEqual("population D");
    expect(requests[0].body).toContain("cql_filter=");
  });

  it("should report live geometry property mismatches with a catalog desync hint", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    mockFetchJSONPost.mockRejectedValue(
      new ServiceResponseError(
        "Erreur HTTP du service (400 Bad Request): InvalidParameterValue: Illegal property name: geometrie",
        {
          http: {
            status: 400,
            statusText: "400 Bad Request",
          },
          service: {
            code: "InvalidParameterValue",
            detail: "Illegal property name: geometrie",
          },
        },
      ),
    );

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
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
    expect(textContent.text).toContain("catalogue embarqué est rejeté");
    expect(textContent.text).toContain("géométrique 'geometrie'");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should keep hits independent from limit and omit propertyName", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    const requests = captureRequests({ numberMatched: 321, totalFeatures: 999 });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "hits",
          limit: 999,
          select: ["code_insee"],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests[0].query.exceptions).toEqual("application/json");
    expect(requests[0].query.count).toEqual("1");
    expect(requests[0].query.propertyName).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(JSON.parse(textContent.text)).toEqual({
      result_type: "hits",
      totalFeatures: 321,
    });
  });

  it("should apply travel_time_filter before returning hit counts", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    captureIsochroneRequests();
    const requests = captureRequests({ numberMatched: 12 });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "hits",
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
    expect(new URLSearchParams(requests[0].body).get("cql_filter")).toEqual(
      "INTERSECTS(geometrie,SRID=4326;POLYGON((2 48,2.2 48,2.2 48.2,2 48)))",
    );
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(JSON.parse(textContent.text)).toEqual({
      result_type: "hits",
      totalFeatures: 12,
    });
  });

  it("should fail clearly when numberMatched is absent", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    captureRequests({ totalFeatures: 321 });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "hits",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("n'a pas retourné de comptage exploitable dans `numberMatched`");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should fail clearly when numberMatched is unknown", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    captureRequests({ numberMatched: "unknown" });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          result_type: "hits",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain('numberMatched="unknown"');
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should return feature_ref for non point layers with geometry set to null", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    captureRequests({
      ...featureCollection,
      crs: null,
      features: [
        {
          type: "Feature",
          id: "commune.1",
          geometry: { type: "MultiPolygon", coordinates: [] },
          geometry_name: "geometrie",
          properties: { code_insee: "01001" },
        },
      ],
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const results = JSON.parse(textContent.text);
    expect(results).not.toHaveProperty("crs");
    expect(results.features[0].geometry).toBeNull();
    expect(results.features[0].feature_ref).toEqual({
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      feature_id: "commune.1",
    });
    expect(results.features[0].geometry_name).toBeUndefined();
  });

  it("should keep bbox-only geometry as a valid GeometryCollection in results mode", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [polygonFeatureType.id]: polygonFeatureType });
    const requests = captureRequests({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "commune.1",
          geometry: {
            type: "Polygon",
            coordinates: [[[2.3, 48.8], [2.4, 48.8], [2.4, 48.9], [2.3, 48.9], [2.3, 48.8]]],
          },
          geometry_name: "geometrie",
          properties: { code_insee: "01001" },
        },
      ],
      totalFeatures: 1,
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          select: ["code_insee"],
          geometry_keep: ["bbox"],
          limit: 1,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0].query.propertyName).toEqual("code_insee,geometrie");
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const results = JSON.parse(textContent.text);
    expect(results.features[0].geometry).toMatchObject({
      type: "GeometryCollection",
      geometries: [],
      bbox: [2.3, 48.8, 2.4, 48.9],
    });
    expect(results.features[0].feature_ref).toEqual({
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      feature_id: "commune.1",
    });
  });

  it("should set point geometry to null and keep feature_ref", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({ [pointFeatureType.id]: pointFeatureType });
    const requests = captureRequests({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "point_d_acces.1",
          geometry: { type: "Point", coordinates: [2.3, 48.8] },
          geometry_name: "geometrie",
          properties: { cleabs: "id-1" },
        },
      ],
      totalFeatures: 1,
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "BDTOPO_V3:point_d_acces",
          select: ["cleabs"],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests[0].query.propertyName).toEqual("cleabs");
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const results = JSON.parse(textContent.text);
    expect(results.features[0].geometry).toBeNull();
    expect(results.features[0].feature_ref).toEqual({
      typename: "BDTOPO_V3:point_d_acces",
      feature_id: "point_d_acces.1",
    });
    expect(results.features[0].geometry_name).toBeUndefined();
  });

  it("should resolve intersects_feature from MultiPoint references", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({
      [polygonFeatureType.id]: polygonFeatureType,
      [multipointFeatureType.id]: multipointFeatureType,
    });
    const requests = captureRequests({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "localisant.1",
          geometry: { type: "MultiPoint", coordinates: [[2.3, 48.8], [2.4, 48.9]] },
          properties: {},
        },
      ],
      totalFeatures: 1,
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          intersects_feature_filter: {
            typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant",
            feature_id: "localisant.1",
          },
          result_type: "http_post_request",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const payload = JSON.parse(textContent.text);
    expect(payload.http_post_request.body).toContain("MULTIPOINT");
  });

  it("should report missing reference features clearly for intersects_feature", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    mockFeatureTypes({
      [polygonFeatureType.id]: polygonFeatureType,
      [multipointFeatureType.id]: multipointFeatureType,
    });
    captureRequests({
      type: "FeatureCollection",
      features: [],
      totalFeatures: 0,
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          intersects_feature_filter: {
            typename: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:localisant",
            feature_id: "localisant.404",
          },
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("est introuvable");
    expect(textContent.text).toContain("localisant.404");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should reject intersects_feature on the same typename and guide to by-id tool", async () => {
    const tool = new GpfWfsGetFeaturesTool();
    const requests = captureRequests(featureCollection);

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_features",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          intersects_feature_filter: {
            typename: "ADMINEXPRESS-COG.LATEST:commune",
            feature_id: "commune.1",
          },
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("gpf_wfs_get_feature_by_id");
    expect(textContent.text).toContain("intersects_feature");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
    expect(requests).toHaveLength(0);
  });
});
