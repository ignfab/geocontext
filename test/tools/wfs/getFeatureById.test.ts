import type { Collection } from "@ignfab/gpf-schema-store";
import { jest } from "@jest/globals";

const mockGetFeatureType = jest.fn<(typename: string) => Promise<Collection>>();
const mockFetchJSONPost = jest.fn<(
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<unknown>>();

jest.unstable_mockModule("../../../src/gpf/wfs-schema-catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsClient: {
    getFeatureType: mockGetFeatureType,
  },
}));

jest.unstable_mockModule("../../../src/helpers/http.js", () => ({
  fetchJSONPost: mockFetchJSONPost,
}));

const { default: GpfWfsGetFeatureByIdTool } = await import("../../../src/tools/GpfWfsGetFeatureByIdTool");

describe("Test GpfWfsGetFeatureByIdTool", () => {
  const polygonFeatureType: Collection = {
    id: "ADMINEXPRESS-COG.LATEST:commune",
    namespace: "ADMINEXPRESS-COG.LATEST",
    name: "commune",
    title: "Commune",
    description: "Description de test",
    properties: [
      { name: "code_insee", type: "string" },
      { name: "nom_officiel", type: "string" },
      { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
    ],
  };

  afterEach(() => {
    jest.restoreAllMocks();
    mockGetFeatureType.mockReset();
    mockFetchJSONPost.mockReset();
  });

  it("should expose an MCP definition with `results|request` result_type only", () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    expect(tool.toolDefinition.title).toEqual("Lecture d’un objet WFS par identifiant");
    expect(tool.toolDefinition.inputSchema.properties?.feature_id).toMatchObject({
      type: "string",
      minLength: 1,
    });
    expect(tool.toolDefinition.inputSchema.properties?.result_type).toMatchObject({
      type: "string",
      enum: ["results", "request"],
    });
  });

  it("should return text content and structuredContent for request", async () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
          result_type: "request",
          select: ["code_insee"],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const request = JSON.parse(textContent.text);
    expect(request.method).toEqual("POST");
    expect(request.query.featureID).toEqual("commune.1");
    expect(request.query.typeNames).toEqual("ADMINEXPRESS-COG.LATEST:commune");
    expect(request.query.propertyName).toEqual("code_insee,geometrie");
    expect(request.query.count).toEqual("2");
    expect(response.structuredContent).toMatchObject({
      result_type: "request",
      method: "POST",
    });
  });

  it("should return exactly one transformed feature for results", async () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    const requests: Array<{ url: string; query: Record<string, string>; body: string }> = [];
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockImplementation(async (url, body) => {
      const [baseUrl, queryString = ""] = url.split("?");
      requests.push({
        url: baseUrl,
        query: Object.fromEntries(new URLSearchParams(queryString).entries()),
        body,
      });
      return {
      type: "FeatureCollection",
      totalFeatures: 1,
      features: [
        {
          type: "Feature",
          id: "commune.1",
          geometry: { type: "MultiPolygon", coordinates: [] },
          geometry_name: "geometrie",
          properties: {
            code_insee: "01001",
            nom_officiel: "L'Abergement-Clémenciat",
          },
        },
      ],
      };
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const results = JSON.parse(textContent.text);
    expect(results.totalFeatures).toEqual(1);
    expect(results.numberMatched).toEqual(1);
    expect(results.features).toHaveLength(1);
    expect(results.features[0].geometry).toBeNull();
    expect(results.features[0].feature_ref).toEqual({
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      feature_id: "commune.1",
    });
    expect(results.features[0].geometry_name).toBeUndefined();
  });

  it("should fail clearly when the feature is missing", async () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockResolvedValue({ type: "FeatureCollection", features: [], totalFeatures: 0 });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.404",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("est introuvable");
    expect(textContent.text).toContain("commune.404");
  });

  it("should fail clearly when multiple features are returned", async () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockResolvedValue({
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "commune.1", geometry: null, properties: {} },
        { type: "Feature", id: "commune.2", geometry: null, properties: {} },
      ],
      totalFeatures: 2,
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("devrait être unique");
  });

  it("should fail clearly when the returned feature id mismatches", async () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockResolvedValue({
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "commune.2", geometry: null, properties: {} },
      ],
      totalFeatures: 1,
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("au lieu de");
  });

  it("should reject invalid result_type values such as hits", async () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_wfs_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
          result_type: "hits",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("results");
    expect(textContent.text).toContain("request");
  });
});
