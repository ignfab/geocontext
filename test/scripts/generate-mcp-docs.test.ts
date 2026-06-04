import { describe, expect, it } from "vitest";
import { z } from "zod";

import { normalizeToolError } from "../../src/errors/toolError.js";

type DocsHelpersModule = {
  toAnchorSlug: (value: string) => string;
  schemaType: (schema: unknown) => string;
  renderPropertyTable: (schema: unknown) => string;
  renderDescription: (description: string | undefined) => string;
  buildValidationErrorExampleForTool: (
    tool: unknown,
    normalizeToolError: (error: unknown) => Record<string, unknown>,
  ) => {
    toolName: string;
    response: {
      isError: true;
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, unknown>;
    };
  } | undefined;
};

let docsHelpers: DocsHelpersModule;

async function loadDocsHelpers() {
  if (docsHelpers) {
    return docsHelpers;
  }

  // @ts-ignore Importing a runtime .mjs script from TS tests.
  docsHelpers = await import("../../scripts/generate-mcp-docs.mjs");
  return docsHelpers;
}

describe("generate-mcp-docs helpers", () => {
  it("should build stable github-like slugs", async () => {
    const { toAnchorSlug } = await loadDocsHelpers();

    expect(toAnchorSlug("gpf_wfs_get_features")).toEqual("gpf_wfs_get_features");
    expect(toAnchorSlug("  Tool Name  ")).toEqual("tool-name");
    expect(toAnchorSlug("Lecture d’un objet WFS")).toEqual("lecture-dun-objet-wfs");
  });

  it("should infer schema types from enum and composition keywords", async () => {
    const { schemaType } = await loadDocsHelpers();

    expect(schemaType(undefined)).toEqual("");
    expect(schemaType({ type: "number" })).toEqual("number");
    expect(schemaType({ type: ["string", "null"] })).toEqual("string | null");
    expect(schemaType({ enum: ["a", "b"] })).toEqual("enum");
    expect(schemaType({ oneOf: [{ type: "string" }] })).toEqual("oneOf");
    expect(schemaType({ anyOf: [{ type: "string" }] })).toEqual("anyOf");
    expect(schemaType({ allOf: [{ type: "string" }] })).toEqual("allOf");
  });

  it("should render a markdown table sorted by property name", async () => {
    const { renderPropertyTable } = await loadDocsHelpers();

    const markdown = renderPropertyTable({
      properties: {
        zeta: { type: "string" },
        alpha: {
          type: "number",
          description: "Primary value",
          default: 3,
        },
      },
      required: ["alpha"],
    });

    expect(markdown).toContain("| `alpha` | number | yes | Primary value Default: 3. |");
    expect(markdown).toContain("| `zeta` | string | no |   |");

    const alphaIndex = markdown.indexOf("`alpha`");
    const zetaIndex = markdown.indexOf("`zeta`");
    expect(alphaIndex).toBeGreaterThan(-1);
    expect(zetaIndex).toBeGreaterThan(alphaIndex);
  });

  it("should preserve multiline descriptions as bullet lists", async () => {
    const { renderDescription } = await loadDocsHelpers();

    const markdown = renderDescription("Line one\nLine two\n\nLine three");
    expect(markdown).toEqual("- Line one\n- Line two\n- Line three");
    expect(renderDescription("Single line")).toEqual("Single line");
  });

  it("should build a validation example without executing the tool", async () => {
    const { buildValidationErrorExampleForTool } = await loadDocsHelpers();

    let executeCount = 0;
    const example = buildValidationErrorExampleForTool(
      {
        name: "adminexpress",
        inputSchema: {
          type: "object",
          properties: {
            lon: { type: "number" },
            lat: { type: "number" },
          },
          required: ["lon", "lat"],
        },
        _instance: {
          schema: z.object({
            lon: z.number(),
            lat: z.number(),
          }).strict(),
          async toolCall() {
            executeCount += 1;
            return undefined;
          },
        },
      },
      normalizeToolError,
    );

    expect(executeCount).toEqual(0);
    expect(example).toMatchObject({
      toolName: "adminexpress",
      response: {
        isError: true,
        content: [
          {
            type: "text",
            text: expect.stringContaining("Paramètres invalides"),
          },
        ],
        structuredContent: {
          type: "urn:geocontext:problem:invalid-tool-params",
          title: "Paramètres d’outil invalides",
        },
      },
    });
  });
});
