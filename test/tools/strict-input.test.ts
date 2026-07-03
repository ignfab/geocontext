import { describe, it, expect } from "vitest";

import AdminexpressTool from "../../src/tools/AdminexpressTool";
import AltitudeTool from "../../src/tools/AltitudeTool";
import AssietteSupTool from "../../src/tools/AssietteSupTool";
import CadastreTool from "../../src/tools/CadastreTool";
import GeocodeTool from "../../src/tools/GeocodeTool";
import GpfCountFeaturesTool from "../../src/tools/GpfCountFeaturesTool";
import GpfDescribeTypeTool from "../../src/tools/GpfDescribeTypeTool";
import GpfGetFeatureByIdTool from "../../src/tools/GpfGetFeatureByIdTool";
import GpfGetFeaturesTool from "../../src/tools/GpfGetFeaturesTool";
import GpfSearchTypesTool from "../../src/tools/GpfSearchTypesTool";
import UrbanismeTool from "../../src/tools/UrbanismeTool";

const strictInputCases = [
  {
    label: "AdminexpressTool",
    tool: new AdminexpressTool(),
    validArguments: { lon: 2.3522, lat: 48.8566 },
  },
  {
    label: "AltitudeTool",
    tool: new AltitudeTool(),
    validArguments: { lon: 2.3522, lat: 48.8566 },
  },
  {
    label: "AssietteSupTool",
    tool: new AssietteSupTool(),
    validArguments: { lon: 2.3522, lat: 48.8566 },
  },
  {
    label: "CadastreTool",
    tool: new CadastreTool(),
    validArguments: { lon: 2.3522, lat: 48.8566 },
  },
  {
    label: "GeocodeTool",
    tool: new GeocodeTool(),
    validArguments: { text: "10 rue de la Paix Paris" },
  },
  {
    label: "GpfCountFeaturesTool",
    tool: new GpfCountFeaturesTool(),
    validArguments: { typename: "BDTOPO_V3:batiment" },
  },
  {
    label: "GpfDescribeTypeTool",
    tool: new GpfDescribeTypeTool(),
    validArguments: { typename: "BDTOPO_V3:batiment" },
  },
  {
    label: "GpfGetFeatureByIdTool",
    tool: new GpfGetFeatureByIdTool(),
    validArguments: {
      typename: "BDTOPO_V3:batiment",
      feature_id: "batiment.1",
    },
  },
  {
    label: "GpfGetFeaturesTool",
    tool: new GpfGetFeaturesTool(),
    validArguments: { typename: "BDTOPO_V3:batiment" },
  },
  {
    label: "GpfSearchTypesTool",
    tool: new GpfSearchTypesTool(),
    validArguments: { query: "batiment" },
  },
  {
    label: "UrbanismeTool",
    tool: new UrbanismeTool(),
    validArguments: { lon: 2.3522, lat: 48.8566 },
  },
] as const;

describe("Strict tool input schemas", () => {
  it.each(strictInputCases)("should reject unexpected arguments for $label", async ({ tool, validArguments }) => {
    const response = await tool.toolCall({
      params: {
        name: tool.name,
        arguments: {
          ...validArguments,
          unexpected: "unexpected",
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
          code: "unknown_parameter",
          name: "unexpected",
          detail: expect.stringContaining("unexpected"),
        }),
      ]),
    });
  });
});
