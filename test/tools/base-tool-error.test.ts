import { z } from "zod";

import BaseTool from "../../src/tools/BaseTool.js";

describe("Test BaseTool error response", () => {
  class DummyTool extends BaseTool<{ lon: number }> {
    name = "dummy_error_tool";
    title = "Dummy Error Tool";
    description = "Dummy tool used to test BaseTool error normalization.";
    schema = z.object({
      lon: z.number().max(180),
    }).strict();

    async execute() {
      throw new Error("runtime failure");
    }
  }

  it("should return normalized validation errors", async () => {
    const tool = new DummyTool();

    const response = await tool.toolCall({
      params: {
        name: "dummy_error_tool",
        arguments: {
          lon: 600,
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Paramètres invalides"),
    });
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:invalid-tool-params",
      errors: expect.arrayContaining([
        expect.objectContaining({
          name: "lon",
          code: "too_big",
        }),
      ]),
    });
  });

  it("should return normalized runtime errors", async () => {
    const tool = new DummyTool();

    const response = await tool.toolCall({
      params: {
        name: "dummy_error_tool",
        arguments: {
          lon: 2.3,
        },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]).toMatchObject({
      type: "text",
      text: "runtime failure",
    });
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
      detail: "runtime failure",
      errors: [
        {
          code: "execution_error",
          detail: "runtime failure",
        },
      ],
    });
  });
});
