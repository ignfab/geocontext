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

const { default: GpfDescribeTypeDetailsTool } = await import("../../../src/tools/GpfDescribeTypeDetailsTool");

describe("Test GpfDescribeTypeDetailsTool", () => {
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
        description: "Code INSEE",
      },
      statut: {
        type: "string",
        description: "Statut",
        oneOf: [
          {
            const: "A",
            title: "Active",
            description: "Commune active",
            "x-ign-representedFeatures": ["Commune"],
          },
        ],
        "x-my-extra": "metadata",
      } as OgcCollectionSchema["properties"][string],
      geometrie: {
        format: "geometry-multipolygon",
        "x-ogc-role": "primary-geometry",
      },
    },
    required: ["code_insee"],
  };

  afterEach(() => {
    vi.clearAllMocks();
    mockGetFeatureType.mockReset();
  });

  it("should expose an enriched MCP definition", () => {
    const tool = new GpfDescribeTypeDetailsTool();
    expect(tool.toolDefinition.title).toEqual("Description des propriétés d’un type GPF");
    expect(tool.toolDefinition.inputSchema.properties?.typename).toMatchObject({
      type: "string",
      minLength: 1,
    });
    expect(tool.toolDefinition.inputSchema.properties?.select).toMatchObject({
      type: "array",
      items: {
        type: "string",
      },
    });
    expect(tool.toolDefinition.outputSchema).toBeDefined();
  });

  it("should return both text content and structuredContent in short mode", async () => {
    const tool = new GpfDescribeTypeDetailsTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: communeType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type_details",
        arguments: {
          typename: COMMUNE_TYPENAME,
          select: ["code_insee", "statut"],
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    const parsed = JSON.parse(textContent.text);
    expect(parsed).toEqual(response.structuredContent);
    expect(parsed).toMatchObject({
      typename: COMMUNE_TYPENAME,
      properties: expect.arrayContaining([
        expect.objectContaining({
          name: "code_insee",
          required: true,
          type: "string",
        }),
      ]),
    });
    expect(parsed.properties.find((p: { name: string }) => p.name === "statut")).toMatchObject({
      oneOf: [
        {
          const: "A",
          description: "Commune active",
        },
      ],
      extra_detail_fields: ["x-my-extra", "x-ign-representedFeatures"],
    });
  });

  it("should include full property schema when extra_details=true", async () => {
    const tool = new GpfDescribeTypeDetailsTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: communeType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type_details",
        arguments: {
          typename: COMMUNE_TYPENAME,
          select: ["statut"],
          extra_details: true,
        },
      },
    });

    expect(response.isError).toBeUndefined();
    const payload = response.structuredContent as {
      properties: Array<Record<string, unknown>>;
    };
    expect(payload.properties[0]).toMatchObject({
      name: "statut",
      type: "string",
      required: false,
      "x-my-extra": "metadata",
      oneOf: [
        {
          const: "A",
          title: "Active",
        },
      ],
    });
  });

  it("should return a payload that validates against its outputSchema", async () => {
    const tool = new GpfDescribeTypeDetailsTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: communeType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type_details",
        arguments: {
          typename: COMMUNE_TYPENAME,
          select: ["code_insee"],
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

  it("should reject invalid selected properties", async () => {
    const tool = new GpfDescribeTypeDetailsTool();
    mockGetFeatureType.mockResolvedValue({ typename: COMMUNE_TYPENAME, schema: communeType });

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type_details",
        arguments: {
          typename: COMMUNE_TYPENAME,
          select: ["geometrie", "does_not_exist"],
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("propriétés non-géométriques");
    expect(textContent.text).toContain("geometrie, does_not_exist");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });

  it("should return isError=true for invalid input", async () => {
    const tool = new GpfDescribeTypeDetailsTool();

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type_details",
        arguments: {
          typename: COMMUNE_TYPENAME,
          select: [],
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "select",
          code: "too_small",
        }),
      ]),
    });
  });

  it("should return isError=true when catalog lookup fails", async () => {
    const tool = new GpfDescribeTypeDetailsTool();
    mockGetFeatureType.mockRejectedValue(new Error("Le type 'X:not_found' est introuvable"));

    const response = await tool.toolCall({
      params: {
        name: "gpf_describe_type_details",
        arguments: {
          typename: "X:not_found",
          select: ["code_insee"],
        },
      },
    });

    expect(response.isError).toBe(true);
    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textContent.text).toContain("X:not_found");
    expect(textContent.text).toContain("gpf_search_types");
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
    });
  });
});
