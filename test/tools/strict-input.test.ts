import AdminexpressTool from "../../src/tools/AdminexpressTool";
import AltitudeTool from "../../src/tools/AltitudeTool";
import AssietteSupTool from "../../src/tools/AssietteSupTool";
import CadastreTool from "../../src/tools/CadastreTool";
import GeocodeTool from "../../src/tools/GeocodeTool";
import GpfWfsDescribeTypeTool from "../../src/tools/GpfWfsDescribeTypeTool";
import GpfWfsGetFeatureByIdTool from "../../src/tools/GpfWfsGetFeatureByIdTool";
import GpfWfsGetFeaturesTool from "../../src/tools/GpfWfsGetFeaturesTool";
import GpfWfsSearchTypesTool from "../../src/tools/GpfWfsSearchTypesTool";
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
    label: "GpfWfsDescribeTypeTool",
    tool: new GpfWfsDescribeTypeTool(),
    validArguments: { typename: "BDTOPO_V3:batiment" },
  },
  {
    label: "GpfWfsGetFeatureByIdTool",
    tool: new GpfWfsGetFeatureByIdTool(),
    validArguments: {
      typename: "BDTOPO_V3:batiment",
      feature_id: "batiment.1",
    },
  },
  {
    label: "GpfWfsGetFeaturesTool",
    tool: new GpfWfsGetFeaturesTool(),
    validArguments: { typename: "BDTOPO_V3:batiment" },
  },
  {
    label: "GpfWfsSearchTypesTool",
    tool: new GpfWfsSearchTypesTool(),
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
