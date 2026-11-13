import { describe, expect, it } from "vitest";

type DocsHelpersModule = {
  toAnchorSlug: (value: string) => string;
  schemaType: (schema: unknown) => string;
  renderPropertyTable: (schema: unknown) => string;
  renderDescription: (description: string | undefined) => string;
  renderResponseContractSection: (definition: { name: string; outputSchema?: unknown }) => string;
  buildAnnotationsSection: (tools: Array<{ name?: string; annotations?: Record<string, boolean> }>) => string[];
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
    expect(markdown).toContain("| Erreur | oui | non | `content[0].text` porte le message d'erreur ; aucun `structuredContent` n'est ajouté (réservé au `outputSchema` du cas de succès). |");
  });

  it("should document the get features single-mode response contract", async () => {
    const { renderResponseContractSection } = await loadDocsHelpers();

    const markdown = renderResponseContractSection({
      name: "gpf_get_features",
    });

    expect(markdown).toContain('| Succès | oui | non | `content[0].text` est la FeatureCollection stringifiée (propriétés attributaires uniquement) ; aucun `structuredContent` n\'est ajouté. |');
  });

  it("should document the get feature by id single-mode response contract", async () => {
    const { renderResponseContractSection } = await loadDocsHelpers();

    const markdown = renderResponseContractSection({
      name: "gpf_get_feature_by_id",
    });

    expect(markdown).toContain('| Succès | oui | oui | `content[0].text` est la FeatureCollection stringifiée, également exposée dans `structuredContent`. |');
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
    expect(markdown).toContain("Annotations MCP exposées dans la définition `tools/list` de chaque tool");
    expect(markdown).toContain("| `readOnlyHint` | oui |");
    expect(markdown).toContain("| `destructiveHint` | non |");
    expect(markdown).toContain("| `idempotentHint` | oui |");
    expect(markdown).toContain("| `openWorldHint` | oui |");

    expect(buildAnnotationsSection([{}, {}])).toEqual([]);
  });

  it("should name the tools whose MCP annotations differ from the others", async () => {
    const { buildAnnotationsSection } = await loadDocsHelpers();

    const markdown = buildAnnotationsSection([
      { name: "tool_a", annotations: { readOnlyHint: true, openWorldHint: true } },
      { name: "tool_b", annotations: { readOnlyHint: true, openWorldHint: false } },
      { name: "tool_c", annotations: { readOnlyHint: true, openWorldHint: false } },
      { name: "tool_d", annotations: { readOnlyHint: true, openWorldHint: true } },
      { name: "tool_e", annotations: { readOnlyHint: true, openWorldHint: true } },
    ]).join("\n");

    expect(markdown).toContain("| `readOnlyHint` | oui |");
    expect(markdown).toContain("| `openWorldHint` | oui (non pour `tool_b` et `tool_c`) |");
  });
});
