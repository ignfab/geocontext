import { afterEach, describe, expect, it, vi } from "vitest";

import type { OgcCollectionSchema } from "@ignfab/gpf-schema-store";
import type { GpfFeatureType } from "../../src/wfs/catalog.js";
import GpfSearchTypesTool from "../../src/tools/GpfSearchTypesTool.js";
import { wfsSchemaStore } from "../../src/wfs/catalog.js";
import { validateStructuredContentAgainstOutputSchema } from "./helpers/outputSchema.js";

vi.mock("../../src/wfs/catalog.js");

describe("Test GpfSearchTypesTool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not fail even when getFeatureType throws a synchronization error", async () => {
    const mockSearchResults = [
      {
        id: "ADMINEXPRESS-COG.LATEST:commune",
        score: 0.95,
      },
      {
        id: "ADMINEXPRESS-COG.LATEST:departement",
        score: 0.85,
      },
    ];

    const mockFeatureTypeSuccess: OgcCollectionSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://example.test/ADMINEXPRESS-COG.LATEST/commune.json",
      type: "object",
      title: "Communes",
      description: "Les communes de France",
      properties: {},
      required: [],
    };

    vi.mocked(wfsSchemaStore).searchFeatureTypesWithScores.mockResolvedValue(mockSearchResults as never);
    
    // First call succeeds, second call throws an error
    vi.mocked(wfsSchemaStore).getFeatureType.mockImplementation(async (id: string) => {
      if (id === "ADMINEXPRESS-COG.LATEST:commune") {
        return {
          typename: id,
          schema: mockFeatureTypeSuccess,
        } satisfies GpfFeatureType;
      }
      throw new Error("Synchronization error: catalog out of sync");
    });

    const tool = new GpfSearchTypesTool();
    const response = await tool.toolCall({
      params: {
        name: "gpf_search_types",
        arguments: {
          query: "commune",
        },
      },
    });

    // Tool should not return an error response even though one feature type failed
    expect(response.isError).toBeUndefined();
    expect(response.content[0]).toMatchObject({
      type: "text",
    });

    const textContent = response.content[0];
    if (textContent.type !== "text") {
      throw new Error("expected text content");
    }

    const parsedContent = JSON.parse(textContent.text);
    expect(parsedContent.results).toHaveLength(2);

    // First result should have successful data
    expect(parsedContent.results[0]).toMatchObject({
      typename: "ADMINEXPRESS-COG.LATEST:commune",
      title: "Communes",
      description: "Les communes de France",
    });

    // Second result should include the error message in the description
    expect(parsedContent.results[1]).toMatchObject({
      typename: "ADMINEXPRESS-COG.LATEST:departement",
    });
    expect(parsedContent.results[1].description).toContain("Synchronization error: catalog out of sync");
    expect(parsedContent.results[1].description).toContain("gpf_describe_type");

    // Verify structured content matches output schema
    if (response.structuredContent !== undefined) {
      expect(
        validateStructuredContentAgainstOutputSchema(
          tool.toolDefinition.outputSchema,
          response.structuredContent,
        ),
      ).toBeNull();
    }
  });
});
