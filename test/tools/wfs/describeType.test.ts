import { vi, describe, it, expect, afterEach } from "vitest";

import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";
import type { GpfFeatureType } from "../../../src/wfs/catalog.js";
import { validateStructuredContentAgainstOutputSchema } from "../helpers/outputSchema";

const mockGetFeatureType = vi.fn<(typename: string) => Promise<GpfFeatureType>>();

vi.doMock("../../../src/wfs/catalog.js", () => ({
  wfsSchemaStore: {
    getFeatureType: mockGetFeatureType,
  },
}));

const { default: GpfDescribeTypeTool } = await import("../../../src/tools/GpfDescribeTypeTool");

describe("Test GpfDescribeTypeTool", () => {
  const COMMUNE_TYPENAME = "ADMINEXPRESS-COG.LATEST:commune";

  const communeType: OgcCollectionSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.test/ADMINEXPRESS-COG.LATEST/commune.json",
    type: "object",
    title: "Commune",
    description: "Description de test",
    properties: {
      code_insee: {
        type: "string",
        description: "Code INSEE officiel de la commune",
      },
      statut: {
        type: "string",
        description: "Type de statut administratif de la commune",
        oneOf: [
          {
            const: "A",
            title: "Active",
            description: "Commune active",
          },
          {
            const: "D",
            title: "Déléguée",
            description: "Commune déléguée",
          },
        ],
      },
      geometrie: {
        format: "geometry-multipolygon",
        "x-ogc-role": "primary-geometry",
      },
    },
    required: ["code_insee"],
    "x-ign-selectionCriteria": "Code INSEE officiel non vide",
  };

  afterEach(() => {
    vi.clearAllMocks();
    mockGetFeatureType.mockReset();
  });

  it("should expose an enriched MCP definition", () => {
    const tool = new GpfDescribeTypeTool();
    expect(tool.toolDefinition.title).toEqual("Description d’un type GPF");
    expect(tool.toolDefinition.inputSchema.properties?.typename).toMatchObject({
      type: "string",
      minLength: 1,
    });
    expect(tool.toolDefinition.outputSchema).toBeDefined();
  });

  it("should return both text content and structuredContent with summarized schema", async () => {
    const tool = new GpfDescribeTypeTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: communeType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type",
        arguments: {
          typename: COMMUNE_TYPENAME,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]).toMatchObject({ type: "text" });
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }

    const parsed = JSON.parse(textContent.text);
    expect(parsed).toEqual(response.structuredContent);
    expect(parsed).toMatchObject({
      typename: COMMUNE_TYPENAME,
      url: "https://example.test/ADMINEXPRESS-COG.LATEST/commune.json",
      geometry_kind: "multipolygon",
      required: ["code_insee"],
      selection_criteria: "Code INSEE officiel non vide",
    });
    expect(parsed.properties).toHaveLength(2);
    expect(parsed.properties.find((p: { name: string }) => p.name === "geometrie")).toBeUndefined();
    expect(parsed.properties.find((p: { name: string }) => p.name === "statut")).toMatchObject({
      oneOf: ["A", "D"],
    });
  });

  it("should include a description for non-geometry properties", async () => {
    const tool = new GpfDescribeTypeTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: communeType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type",
        arguments: {
          typename: COMMUNE_TYPENAME,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as {
      properties: Array<{ name: string; description?: string }>;
    };
    const description = payload.properties.find((p) => p.name === "code_insee")?.description;
    expect(description).toEqual("Code INSEE officiel de la commune");
  });

  it("should omit selection_criteria when not provided by the schema", async () => {
    const tool = new GpfDescribeTypeTool();
    const { ["x-ign-selectionCriteria"]: _ignored, ...schemaWithoutCriteria } = communeType;
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: schemaWithoutCriteria });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type",
        arguments: {
          typename: COMMUNE_TYPENAME,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as {
      selection_criteria?: string;
    };
    expect(payload.selection_criteria).toBeUndefined();
  });

  it("should return a payload that validates against its outputSchema", async () => {
    const tool = new GpfDescribeTypeTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: communeType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type",
        arguments: {
          typename: COMMUNE_TYPENAME,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    expect(
      validateStructuredContentAgainstOutputSchema(
        tool.toolDefinition.outputSchema,
        response.structuredContent,
      ),
    ).toBeNull();
  });

  it("should return isError=true for invalid input", async () => {
    const tool = new GpfDescribeTypeTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type",
        arguments: {
          typename: "",
        },
      },
    });

    expect(response.isError).toBe(true);
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

  it("should return isError=true when catalog lookup fails", async () => {
    const tool = new GpfDescribeTypeTool();
    mockGetFeatureType.mockRejectedValue(new Error("Le type 'BDTOPO_V3:not_found' est introuvable"));

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type",
        arguments: {
          typename: "BDTOPO_V3:not_found",
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("Le type 'BDTOPO_V3:not_found' est introuvable");
    expect(textContent.text).toContain("gpf_search_types");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should select the primary geometry when several geometries exist", async () => {
    const multiGeometryType: OgcCollectionSchema = {
      ...communeType,
      properties: {
        code_insee: {
          type: "string",
          description: "Code INSEE officiel de la commune",
        },
        geometrie: {
          format: "geometry-multipolygon",
          "x-ogc-role": "primary-geometry",
        },
        emprise: {
          format: "geometry-point",
        },
      },
      required: ["code_insee", "geometrie"],
    };

    const tool = new GpfDescribeTypeTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: multiGeometryType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type",
        arguments: {
          typename: COMMUNE_TYPENAME,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as {
      geometry_kind?: string;
      properties: Array<{ name: string }>;
      required: string[];
    };
    expect(payload.geometry_kind).toEqual("multipolygon");
    expect(payload.properties.map((p) => p.name)).toEqual(["code_insee"]);
    expect(payload.required).toEqual(["code_insee"]);
  });
});
