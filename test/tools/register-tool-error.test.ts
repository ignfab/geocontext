import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { z } from "zod";

import logger from "../../src/logger.js";
import type { McpTool } from "../../src/helpers/tools.js";
import { toolCall } from "./helpers/mcp";

describe("Test registerTool error response", () => {
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  class DummyTool implements McpTool {
    name = "dummy_error_tool";
    title = "Dummy Error Tool";
    description = "Dummy tool used to test registerTool error normalization.";
    annotations = {};
    inputSchema = z.strictObject({
      lon: z.number().max(180),
      delayMs: z.number().int().min(0).optional(),
    });

    async execute(input: { lon: number; delayMs?: number }) {
      if (input.delayMs !== undefined) {
        await new Promise((resolve) => setTimeout(resolve, input.delayMs));
      }

      throw new Error(`runtime failure for lon=${input.lon}`);
    }
  }

  it("should return normalized validation errors", async () => {
    const tool = new DummyTool();

    const response = await toolCall(tool, {
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
        problem_type: "urn:geocontext:problem:invalid-tool-params",
        problem_title: "Paramètres d’outil invalides",
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
    // Reserved for the success-path `outputSchema`; never set on errors.
    expect(response.structuredContent).toBeUndefined();
  });

  it("should return normalized runtime errors", async () => {
    const tool = new DummyTool();

    const response = await toolCall(tool, {
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
    expect(response.structuredContent).toBeUndefined();
  });

  it("should not report a result breaking the output schema as invalid parameters", async () => {
    const tool = { ...new DummyTool(), outputSchema: z.object({ count: z.number() }), execute: async () => ({ count: "many" }) };

    const response = await toolCall(tool, {
      params: { name: "dummy_error_tool", arguments: { lon: 2.3 } },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Le résultat de l'outil dummy_error_tool ne respecte pas son schéma de sortie"),
    });
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ error_codes: ["execution_error"] }),
    );
  });

  // Published with `additionalProperties: false`: a client checking the output
  // schema would reject an undeclared key.
  it("should strip the result keys the output schema does not declare", async () => {
    const tool = { ...new DummyTool(), outputSchema: z.object({ count: z.number() }), execute: async () => ({ count: 1, extra: true }) };

    const response = await toolCall(tool, {
      params: { name: "dummy_error_tool", arguments: { lon: 2.3 } },
    });

    expect(response.structuredContent).toEqual({ count: 1 });
    expect(response.content).toEqual([{ type: "text", text: JSON.stringify({ count: 1 }) }]);
  });

  it("should keep the matching input in concurrent runtime error logs", async () => {
    const tool = new DummyTool();

    const [firstResponse, secondResponse] = await Promise.all([
      toolCall(tool, {
        params: {
          name: "dummy_error_tool",
          arguments: {
            lon: 12.34,
            delayMs: 30,
          },
        },
      }),
      toolCall(tool, {
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
