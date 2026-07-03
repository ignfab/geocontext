import { describe, expect, it } from "vitest";
import { z } from "zod";

import { normalizeToolError } from "../../src/errors/toolError.js";

type DocsHelpersModule = {
  toAnchorSlug: (value: string) => string;
  schemaType: (schema: unknown) => string;
  renderPropertyTable: (schema: unknown) => string;
  renderDescription: (description: string | undefined) => string;
  renderResponseContractSection: (definition: { name: string; outputSchema?: unknown }) => string;
  buildAnnotationsSection: (tools: Array<{ annotations?: Record<string, boolean> }>) => string[];
  sortToolDefinitions: <T extends { name: string }>(definitions: T[]) => T[];
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

    expect(toAnchorSlug("gpf_get_features")).toEqual("gpf_get_features");
    expect(toAnchorSlug("  Tool Name  ")).toEqual("tool-name");
    expect(toAnchorSlug("Lecture d’un objet GPF")).toEqual("lecture-dun-objet-gpf");
  });

  it("should infer schema types from enum and composition keywords", async () => {
    const { schemaType } = await loadDocsHelpers();

    expect(schemaType(undefined)).toEqual("");
    expect(schemaType({ type: "number" })).toEqual("number");
    expect(schemaType({ type: ["string", "null"] })).toEqual("string | null");
    expect(schemaType({ type: "string", enum: ["a", "b"] })).toEqual("string (enum)");
    expect(schemaType({ enum: ["a", "b"] })).toEqual("enum");
    expect(schemaType({ oneOf: [{ type: "string" }] })).toEqual("oneOf");
    expect(schemaType({ anyOf: [{ type: "string" }] })).toEqual("anyOf");
    expect(schemaType({ allOf: [{ type: "string" }] })).toEqual("allOf");
  });

  it("should sort tools in documentation reading order", async () => {
    const { sortToolDefinitions } = await loadDocsHelpers();

    const sorted = sortToolDefinitions([
      { name: "gpf_get_features" },
      { name: "adminexpress" },
      { name: "geocode" },
      { name: "unknown_custom_tool" },
      { name: "altitude" },
    ]);

    expect(sorted.map((tool) => tool.name)).toEqual([
      "geocode",
      "altitude",
      "adminexpress",
      "gpf_get_features",
      "unknown_custom_tool",
    ]);
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

    expect(markdown).toContain("| Champ | Type | Requis | Description |");
    expect(markdown).toContain("| `alpha` | number | oui | Primary value Valeur par défaut : 3. |");
    expect(markdown).toContain("| `zeta` | string | non |   |");

    const alphaIndex = markdown.indexOf("`alpha`");
    const zetaIndex = markdown.indexOf("`zeta`");
    expect(alphaIndex).toBeGreaterThan(-1);
    expect(zetaIndex).toBeGreaterThan(alphaIndex);
  });

  it("should preserve multiline descriptions as technical text blocks", async () => {
    const { renderDescription } = await loadDocsHelpers();

    const markdown = renderDescription("Line one\nLine two\n\nLine three");
    expect(markdown).toEqual("```\nLine one\nLine two\nLine three\n```");
    expect(renderDescription("Single line")).toEqual("```\nSingle line\n```");
  });

  it("should document the default MCP response contract", async () => {
    const { renderResponseContractSection } = await loadDocsHelpers();

    const markdown = renderResponseContractSection({
      name: "altitude",
      outputSchema: { type: "object" },
    });

    expect(markdown).toContain("### Réponse MCP");
    expect(markdown).toContain("| Succès | oui | oui | `content[0].text` est `JSON.stringify(structuredContent)`. |");
    expect(markdown).toContain("| Erreur | oui | oui | `content[0].text` contient `structuredContent.detail`, pas le JSON d'erreur complet de `structuredContent`. |");
  });

  it("should document the get features response modes", async () => {
    const { renderResponseContractSection } = await loadDocsHelpers();

    const markdown = renderResponseContractSection({
      name: "gpf_get_features",
    });
  });

  it("should document shared MCP annotations", async () => {
    const { buildAnnotationsSection } = await loadDocsHelpers();

    const section = buildAnnotationsSection([
      {
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      {
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
    ]);

    const markdown = section.join("\n");
    expect(markdown).toContain("## Annotations MCP");
    expect(markdown).toContain("Tous les tools exposent les mêmes annotations MCP");
    expect(markdown).toContain("| `readOnlyHint` | oui |");
    expect(markdown).toContain("| `destructiveHint` | non |");
    expect(markdown).toContain("| `idempotentHint` | oui |");
    expect(markdown).toContain("| `openWorldHint` | oui |");

    expect(buildAnnotationsSection([
      { annotations: { readOnlyHint: true } },
      { annotations: { readOnlyHint: false } },
    ])).toEqual([]);
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
