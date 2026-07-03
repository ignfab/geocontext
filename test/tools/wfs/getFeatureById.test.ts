import { vi, describe, it, expect, afterEach } from "vitest";

import type { Collection } from "@ignfab/gpf-schema-store";
import { ServiceResponseError } from "../../../src/helpers/http.js";

const mockGetFeatureType = vi.fn<(typename: string) => Promise<Collection>>();
const mockFetchJSONPost = vi.fn<(
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<unknown>>();

vi.doMock("../../../src/wfs/catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsSchemaStore: {
    getFeatureType: mockGetFeatureType,
  },
}));

vi.doMock("../../../src/helpers/http.js", () => ({
  fetchJSONPost: mockFetchJSONPost,
  ServiceResponseError,
}));

const { default: GpfGetFeatureByIdTool } = await import("../../../src/tools/GpfGetFeatureByIdTool");

describe("Test GpfGetFeatureByIdTool", () => {
  class InvalidSuccessPayloadTool extends GpfGetFeatureByIdTool {
    async execute() {
      return { unexpected: true } as never;
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
      { name: "nom_officiel", type: "string" },
      { name: "geometrie", type: "multipolygon", defaultCrs: "EPSG:4326" },
    ],
  };

  afterEach(() => {
    vi.clearAllMocks();
    mockGetFeatureType.mockReset();
    mockFetchJSONPost.mockReset();
  });

  it("should expose an MCP definition with explicit HTTP result types", () => {
    const tool = new GpfGetFeatureByIdTool();
    expect(tool.toolDefinition.title).toEqual("Lecture d’un objet GPF par identifiant");
    expect(tool.toolDefinition.inputSchema).toEqual({
      type: "object",
      properties: {
        typename: {
          type: "string",
          minLength: 1,
          description: "Nom exact du type GPF à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`.",
        },
        feature_id: {
          type: "string",
          minLength: 1,
          description: "Identifiant GPF exact de l'objet à récupérer, par exemple `commune.8952`.",
        },
        spatial_extras: {
          type: "array",
          items: {
            enum: ["centroid", "bbox"],
            type: "string",
          },
          default: [],
          description: "Éléments calculés depuis la géométrie à renvoyer pour `result_type=results`. Peut inclure `centroid` et `bbox`, aucun par défaut.",
        },
        select: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
          },
          minItems: 1,
          description: "Liste des attributs (à l'exception de la géométrie) à renvoyer.  Utiliser `gpf_wfs_describe_type` pour connaître les noms exacts disponibles. Exemple : `[\"code_insee\", \"nom_officiel\"]`.",
        },
      },
      required: ["typename", "feature_id"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
    });
  });

  it("should return text content and structuredContent for selected properties", async () => {
    const tool = new GpfGetFeatureByIdTool();
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockResolvedValue({
      type: "FeatureCollection",
      totalFeatures: 1,
      numberMatched: 1,
      numberReturned: 1,
      timeStamp: "2026-01-01T00:00:00.000Z",
      features: [
        {
          type: "Feature",
          id: "commune.1",
          geometry: { type: "MultiPolygon", coordinates: [] },
          properties: { code_insee: "01001" },
        },
      ],
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
          select: ["code_insee"],
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
    expect(payload.features).toHaveLength(1);
    expect(payload.features[0].feature_ref).toEqual({
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      feature_id: "commune.1",
    });
    const url = new URL(payload.collection_url);
    expect(url.searchParams.get("featureID")).toEqual("commune.1");
    expect(url.searchParams.get("typeNames")).toEqual("ADMINEXPRESS-COG.LATEST:commune");
    expect(url.searchParams.get("exceptions")).toEqual("application/json");
    expect(url.searchParams.get("propertyName")).toEqual("code_insee,geometrie");
    expect(url.searchParams.get("count")).toEqual("2");
  });


  it("should return exactly one transformed feature for results", async () => {
    const tool = new GpfGetFeatureByIdTool();
    const requests: Array<{ url: string; query: Record<string, string> }> = [];
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockImplementation(async (url, _body) => {
      const [baseUrl, queryString = ""] = url.split("?");
      requests.push({
        url: baseUrl,
        query: Object.fromEntries(new URLSearchParams(queryString).entries()),
      });
      return {
      type: "FeatureCollection",
      totalFeatures: 1,
      numberMatched: 1,
      numberReturned: 1,
      timeStamp: "2026-01-01T00:00:00.000Z",
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
        name: "gpf_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0].query.exceptions).toEqual("application/json");
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const results = JSON.parse(textContent.text);
    expect(response.structuredContent).toEqual(results);
    expect(results.totalFeatures).toEqual(1);
    expect(results.numberMatched).toEqual(1);
    expect(results.numberReturned).toEqual(1);
    expect(results.features).toHaveLength(1);
    expect(results.features[0].feature_ref).toEqual({
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      feature_id: "commune.1",
    });
    expect(results.features[0].geometry_name).toBeUndefined();
  });

  it("should include the bbox when asked in spatial_extras", async () => {
    const tool = new GpfGetFeatureByIdTool();
    const requests: Array<{ url: string; query: Record<string, string> }> = [];
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockImplementation(async (url, _body) => {
      const [baseUrl, queryString = ""] = url.split("?");
      requests.push({
        url: baseUrl,
        query: Object.fromEntries(new URLSearchParams(queryString).entries()),
      });

      return {
        type: "FeatureCollection",
        totalFeatures: 1,
        features: [
          {
            type: "Feature",
            id: "commune.1",
            geometry: {
              type: "Polygon",
              coordinates: [[[2.3, 48.8], [2.4, 48.8], [2.4, 48.9], [2.3, 48.9], [2.3, 48.8]]],
            },
            geometry_name: "geometrie",
            properties: {
              code_insee: "01001",
            },
          },
        ],
      };
    });

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id",
        arguments: {
          typename: "ADMINEXPRESS-COG.LATEST:commune",
          feature_id: "commune.1",
          select: ["code_insee"],
          spatial_extras: ["bbox"],
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
    expect(results.features[0].bbox).toBeDefined();
    expect(results.features[0].bbox).toStrictEqual([2.3, 48.8, 2.4, 48.9]);
    expect(results.features[0].centroid).toBeUndefined();
  });

  it("should fail clearly when the feature is missing", async () => {
    const tool = new GpfGetFeatureByIdTool();
    mockGetFeatureType.mockResolvedValue(polygonFeatureType);
    mockFetchJSONPost.mockResolvedValue({ type: "FeatureCollection", features: [], totalFeatures: 0 });

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id",
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
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should fail clearly when multiple features are returned", async () => {
    const tool = new GpfGetFeatureByIdTool();
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
        name: "gpf_get_feature_by_id",
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
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should fail clearly when the returned feature id mismatches", async () => {
    const tool = new GpfGetFeatureByIdTool();
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
        name: "gpf_get_feature_by_id",
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
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should fail clearly when execution returns an unexpected success payload", async () => {
    const tool = new InvalidSuccessPayloadTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_get_feature_by_id",
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
    expect(textContent.text).toContain("Réponse interne inattendue");
    expect(textContent.text).toContain("FeatureCollection");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
      detail: expect.stringContaining("gpf_get_feature_by_id"),
    });
  });
});
