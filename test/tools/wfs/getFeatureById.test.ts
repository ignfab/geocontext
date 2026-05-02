import type { Collection } from "@ignfab/gpf-schema-store";
import { vi } from "vitest";
import { ServiceResponseError } from "../../../src/helpers/http.js";

const mockGetFeatureType = vi.fn<(typename: string) => Promise<Collection>>();
const mockFetchJSONPost = vi.fn<(
  url: string,
  body?: string,
  headers?: Record<string, string>,
) => Promise<unknown>>();

vi.doMock("../../../src/gpf/wfs-schema-catalog.js", () => ({
  GPF_WFS_URL: "https://data.geopf.fr/wfs",
  wfsClient: {
    getFeatureType: mockGetFeatureType,
  },
}));

vi.doMock("../../../src/helpers/http.js", () => ({
  fetchJSONPost: mockFetchJSONPost,
  ServiceResponseError,
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
    vi.restoreAllMocks();
    mockGetFeatureType.mockReset();
    mockFetchJSONPost.mockReset();
  });

  it("should expose an MCP definition with `results|request` result_type only", () => {
    const tool = new GpfWfsGetFeatureByIdTool();
    expect(tool.toolDefinition.title).toEqual("Lecture d’un objet WFS par identifiant");
    expect(tool.toolDefinition.inputSchema).toEqual({
      type: "object",
      properties: {
        typename: {
          type: "string",
          minLength: 1,
          description: "Nom exact du type WFS à interroger, par exemple `ADMINEXPRESS-COG.LATEST:commune`.",
        },
        feature_id: {
          type: "string",
          minLength: 1,
          description: "Identifiant WFS exact de l'objet à récupérer, par exemple `commune.8952`.",
        },
        result_type: {
          type: "string",
          enum: ["results", "request"],
          default: "results",
          description: "`results` renvoie une FeatureCollection normalisée avec exactement un objet. `request` renvoie la requête WFS compilée (`get_url`) à destination de `create_map` via `geojson_url`, ou pour déboguer.",
        },
        select: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
          },
          minItems: 1,
          description: "Liste des propriétés non géométriques à renvoyer. Quand `result_type=\"request\"`, la géométrie est automatiquement ajoutée.",
        },
      },
      required: ["typename", "feature_id"],
      additionalProperties: false,
      $schema: "http://json-schema.org/draft-07/schema#",
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
    expect(request.query.exceptions).toEqual("application/json");
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
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
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
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
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
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
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
    expect(textContent.text).toContain("Paramètres invalides");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "result_type",
          code: "invalid_enum_value",
          detail: expect.stringContaining("results"),
        }),
      ]),
    });
  });
});
