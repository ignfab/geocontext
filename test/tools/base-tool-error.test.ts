import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { z } from "zod";

import logger from "../../src/logger.js";
import BaseTool from "../../src/tools/BaseTool.js";

describe("Test BaseTool error response", () => {
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  class DummyTool extends BaseTool<{ lon: number; delayMs?: number }> {
    name = "dummy_error_tool";
    title = "Dummy Error Tool";
    description = "Dummy tool used to test BaseTool error normalization.";
    schema = z.object({
      lon: z.number().max(180),
      delayMs: z.number().int().min(0).optional(),
    }).strict();

    async execute(input: { lon: number; delayMs?: number }) {
      if (input.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, input.delayMs));
      }

      throw new Error(`runtime failure for lon=${input.lon}`);
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

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[tool] failed dummy_error_tool: Paramètres invalides"),
      expect.objectContaining({
        tool: "dummy_error_tool",
        input: {
          lon: 600,
        },
        error_codes: expect.arrayContaining(["too_big"]),
      }),
    );
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

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      "[tool] failed dummy_error_tool: runtime failure for lon=2.3",
      expect.objectContaining({
        tool: "dummy_error_tool",
        input: {
          lon: 2.3,
        },
        error_codes: ["execution_error"],
      }),
    );
    expect(response.isError).toBe(true);
    expect(response.content[0]).toMatchObject({
      type: "text",
      text: "runtime failure for lon=2.3",
    });
    expect(response.structuredContent).toMatchObject({
      type: "urn:geocontext:problem:execution-error",
      detail: "runtime failure for lon=2.3",
      errors: [
        {
          code: "execution_error",
          detail: "runtime failure for lon=2.3",
        },
      ],
    });
  });

  it("should keep the matching input in concurrent runtime error logs", async () => {
    const tool = new DummyTool();

    const [firstResponse, secondResponse] = await Promise.all([
      tool.toolCall({
        params: {
          name: "dummy_error_tool",
          arguments: {
            lon: 12.34,
            delayMs: 30,
          },
        },
      }),
      tool.toolCall({
        params: {
          name: "dummy_error_tool",
          arguments: {
            lon: 56.78,
            delayMs: 0,
          },
        },
      }),
    ]);

    expect(firstResponse.isError).toBe(true);
    expect(secondResponse.isError).toBe(true);
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      "[tool] failed dummy_error_tool: runtime failure for lon=56.78",
      expect.objectContaining({
        tool: "dummy_error_tool",
        input: {
          lon: 56.78,
          delayMs: 0,
        },
      }),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      "[tool] failed dummy_error_tool: runtime failure for lon=12.34",
      expect.objectContaining({
        tool: "dummy_error_tool",
        input: {
          lon: 12.34,
          delayMs: 30,
        },
      }),
    );
  });
});
