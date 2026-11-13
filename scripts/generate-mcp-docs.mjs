import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputPath = join(repoRoot, "docs", "mcp-tools.md");
const miniSearchOptionsEnv = "GPF_WFS_MINISEARCH_OPTIONS";

/**
 * @typedef {object} JsonSchema
 * @property {string|string[]=} type
 * @property {string=} description
 * @property {unknown[]=} enum
 * @property {unknown=} default
 * @property {Record<string, JsonSchema>=} properties
 * @property {string[]=} required
 * @property {JsonSchema=} items
 * @property {JsonSchema[]=} anyOf
 * @property {JsonSchema[]=} oneOf
 * @property {JsonSchema[]=} allOf
 */

/**
 * @typedef {object} ToolDefinition
 * @property {string} name
 * @property {string=} title
 * @property {string=} description
 * @property {Record<string, boolean>=} annotations
 * @property {JsonSchema=} inputSchema
 * @property {JsonSchema=} outputSchema
 */

function formatInline(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

/**
 * Renders multi-line tool descriptions in a markdown-friendly way so line
 * breaks remain visible in GitHub rendering.
 *
 * @param {string | undefined} description
 * @returns {string}
 */
export function renderDescription(description) {
  if (!description || description.trim() === "") {
    return "_Aucune description fournie._";
  }

  const normalizedDescription = description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return normalizedDescription
    ? `\`\`\`\n${normalizedDescription}\n\`\`\``
    : "_Aucune description fournie._";
}

/**
 * Builds a GitHub-style slug for markdown headings.
 *
 * @param {string} value
 * @returns {string}
 */
export function toAnchorSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * @param {JsonSchema | undefined} schema
 * @returns {string}
 */
export function schemaType(schema) {
  if (!schema) {
    return "";
  }
  if (Array.isArray(schema.type)) {
    const type = schema.type.join(" | ");
    return schema.enum?.length ? `${type} (enum)` : type;
  }
  if (schema.type) {
    return schema.enum?.length ? `${schema.type} (enum)` : schema.type;
  }
  if (schema.enum?.length) {
    return "enum";
  }
  if (schema.oneOf?.length) {
    return "oneOf";
  }
  if (schema.anyOf?.length) {
    return "anyOf";
  }
  if (schema.allOf?.length) {
    return "allOf";
  }
  return "";
}

/**
 * @param {JsonSchema | undefined} schema
 * @returns {string}
 */
export function renderPropertyTable(schema) {
  const properties = schema?.properties;
  if (!properties || Object.keys(properties).length === 0) {
    return "_Aucune propriété de premier niveau documentée._";
  }

  const required = new Set(schema?.required ?? []);
  const rows = Object.entries(properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, propertySchema]) => {
      const type = schemaType(propertySchema);
      const enumValues = propertySchema.enum?.length
        ? ` Valeurs : ${propertySchema.enum.map(formatInline).join(", ")}.`
        : "";
      const defaultValue =
        propertySchema.default !== undefined
          ? ` Valeur par défaut : ${formatInline(propertySchema.default)}.`
          : "";
      const description = `${propertySchema.description ?? ""}${enumValues}${defaultValue}`.trim();

      return `| \`${escapeCell(name)}\` | ${escapeCell(type || " ")} | ${required.has(name) ? "oui" : "non"} | ${escapeCell(description || " ")} |`;
    });

  return [
    "| Champ | Type | Requis | Description |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/**
 * @param {JsonSchema | undefined} schema
 * @returns {string}
 */
export function renderSchemaBlock(schema) {
  if (!schema) {
    return "_Aucun JSON Schema exposé par cette définition de tool._";
  }

  return `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
}

function renderResponseContractTable(rows) {
  return [
    "| Cas | `content` | `structuredContent` | Relation entre `content` et `structuredContent` |",
    "| --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.caseName} | ${row.content} | ${row.structuredContent} | ${row.relation} |`),
  ].join("\n");
}

/**
 * @param {ToolDefinition} definition
 * @returns {string}
 */
export function renderResponseContractSection(definition) {
  const errorRow = {
    caseName: "Erreur",
    content: "oui",
    structuredContent: "non",
    relation: "`content[0].text` porte le message d'erreur ; aucun `structuredContent` n'est ajouté (réservé au `outputSchema` du cas de succès).",
  };

  if (definition.name === "gpf_get_features") {
    return [
      "### Réponse MCP",
      "",
      renderResponseContractTable([
        {
          caseName: "Succès",
          content: "oui",
          structuredContent: "non",
          relation: "`content[0].text` est la FeatureCollection stringifiée (propriétés attributaires uniquement) ; aucun `structuredContent` n'est ajouté.",
        },
        errorRow,
      ]),
    ].join("\n");
  }

  if (definition.name === "gpf_get_feature_by_id") {
    return [
      "### Réponse MCP",
      "",
      renderResponseContractTable([
        {
          caseName: "Succès",
          content: "oui",
          structuredContent: "oui",
          relation: "`content[0].text` est la FeatureCollection stringifiée, également exposée dans `structuredContent`.",
        },
        errorRow,
      ]),
    ].join("\n");
  }

  return [
    "### Réponse MCP",
    "",
    renderResponseContractTable([
      {
        caseName: "Succès",
        content: "oui",
        structuredContent: definition.outputSchema ? "oui" : "non",
        relation: definition.outputSchema
          ? "`content[0].text` est `JSON.stringify(structuredContent)`."
          : "`content[0].text` contient la réponse stringifiée ; aucun `structuredContent` n'est ajouté.",
      },
      errorRow,
    ]),
  ].join("\n");
}

/**
 * @param {ToolDefinition} definition
 * @returns {string}
 */
export function renderOutputSection(definition) {
  if (definition.outputSchema) {
    return [
      "### Schéma de sortie",
      "",
      renderPropertyTable(definition.outputSchema),
      "",
      "<details>",
      "<summary>Schéma de sortie brut</summary>",
      "",
      renderSchemaBlock(definition.outputSchema),
      "",
      "</details>",
    ].join("\n");
  }

  return [
    "### Sortie",
    "",
    "Aucun `outputSchema` unique n'est exposé. La sortie est gérée par la sérialisation JSON par défaut ou par un formatage de réponse spécifique.",
  ].join("\n");
}

async function loadPackageMetadata() {
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, "package.json"), "utf8"),
  );

  return {
    name: typeof packageJson.name === "string" ? packageJson.name : "unknown",
    version: typeof packageJson.version === "string" ? packageJson.version : "unknown",
  };
}

function normalizePotentiallyInvalidEnv() {
  const raw = process.env[miniSearchOptionsEnv];
  if (!raw || raw.trim() === "") {
    return;
  }

  try {
    JSON.parse(raw);
  } catch {
    // Keep docs generation deterministic even when local shell env has invalid JSON.
    delete process.env[miniSearchOptionsEnv];
    console.warn(
      `[docs:mcp] Ignored invalid ${miniSearchOptionsEnv} during docs generation.`,
    );
  }
}

/**
 * Lists the tools through an MCP client, and calls the first tool with a required
 * parameter without arguments: a validation error, answered before any service call.
 */
async function loadToolDefinitions() {
  normalizePotentiallyInvalidEnv();

  const { createServer, tools } = await import(pathToFileURL(join(repoRoot, "dist", "server.js")).href);
  // The server would log the expected validation error of the example.
  const { default: logger } = await import(pathToFileURL(join(repoRoot, "dist", "logger.js")).href);
  logger.silent = true;
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: "docs-mcp", version: "0.0.0" });
  await client.connect(clientTransport);
  const { tools: definitions } = await client.listTools();
  const invalidTool = definitions.find((definition) => definition.inputSchema.required?.length);
  const errorExample = invalidTool && {
    toolName: invalidTool.name,
    response: await client.callTool({ name: invalidTool.name, arguments: {} }),
  };
  await client.close();

  return {
    errorExample,
    tools: definitions.map((definition) => {
      const instance = tools.find((tool) => tool.name === definition.name);
      return { source: `src/tools/${instance.constructor.name}.ts`, ...definition };
    }),
  };
}

function buildErrorContractSection(errorExample) {
  if (!errorExample) {
    return [];
  }

  const errorExampleWithJsonRpcEnvelope = {
    jsonrpc: "2.0",
    id: `${errorExample.toolName}:invalid-input-example`,
    result: errorExample.response,
  };

  return [
    "## Contrat d’erreur MCP",
    "",
    "- En cas d'échec, chaque tool renvoie `isError: true`.",
    "- `content.text` contient le message de détail en français.",
    "- Aucun `structuredContent` n'est renvoyé : ce champ est réservé au `outputSchema` du cas de succès.",
    "",
    "Exemple complet généré automatiquement à partir d'un appel de tool invalide (contrainte de validation) :",
    "",
    "```json",
    JSON.stringify(errorExampleWithJsonRpcEnvelope, null, 2),
    "```",
  ];
}

/** The value most tools share for `key`, followed by the tools that differ from it. */
function describeAnnotationValue(tools, key) {
  const values = tools.map((tool) => Boolean(tool.annotations[key]));
  const usual = values.filter(Boolean).length * 2 >= values.length;
  const exceptions = tools
    .filter((_tool, index) => values[index] !== usual)
    .map((tool) => `\`${tool.name}\``);
  const format = (value) => (value ? "oui" : "non");
  if (exceptions.length === 0) {
    return format(usual);
  }
  const names = exceptions.join(", ").replace(/, ([^,]*)$/, " et $1");
  return `${format(usual)} (${format(!usual)} pour ${names})`;
}

export function buildAnnotationsSection(tools) {
  const annotatedTools = tools.filter((tool) => tool.annotations);

  if (annotatedTools.length === 0) {
    return [];
  }

  return [
    "## Annotations MCP",
    "",
    "Annotations MCP exposées dans la définition `tools/list` de chaque tool :",
    "",
    "| Annotation | Valeur | Signification |",
    "| --- | --- | --- |",
    `| \`readOnlyHint\` | ${describeAnnotationValue(annotatedTools, "readOnlyHint")} | Le tool consulte des données sans modifier d'état côté serveur. |`,
    `| \`destructiveHint\` | ${describeAnnotationValue(annotatedTools, "destructiveHint")} | Le tool n'est pas signalé comme destructif. |`,
    `| \`idempotentHint\` | ${describeAnnotationValue(annotatedTools, "idempotentHint")} | Répéter le même appel ne déclenche pas d'effet de bord supplémentaire attendu. |`,
    `| \`openWorldHint\` | ${describeAnnotationValue(annotatedTools, "openWorldHint")} | Le tool interroge des sources externes ou ouvertes, dont le contenu peut évoluer. |`,
  ];
}

function buildDocumentLines(pkg, tools, errorExample) {
  const errorContractSection = buildErrorContractSection(errorExample);
  const annotationsSection = buildAnnotationsSection(tools);
  const lines = [
    "# Référence des tools MCP",
    "",
    `Ce document est généré automatiquement à partir des définitions de tools exposées par la méthode \`tools/list\` du protocole MCP pour \`${pkg.name}\` dans sa version v${pkg.version}. Pour le mettre à jour, lancer \`npm run docs:mcp\`.`,
    ...(errorContractSection.length > 0 ? ["", ...errorContractSection] : []),
    ...(annotationsSection.length > 0 ? ["", ...annotationsSection] : []),
    "",
    "## Liste des tools",
    "",
    ...tools.map((tool) => `- [\`${tool.name}\`](#${toAnchorSlug(tool.name)})`),
  ];

  for (const tool of tools) {
    lines.push(
      "",
      `## \`${tool.name}\``,
      "",
      `Code Source : [${tool.source}](../${tool.source})`,
      "",
      "### Titre",
      "",
      tool.title ?? "",
      "",
      "### Description du tool",
      "",
      renderDescription(tool.description),
      "",
      "### Schéma d’entrée",
      "",
      renderPropertyTable(tool.inputSchema),
      "",
      "<details>",
      "<summary>Schéma d’entrée brut</summary>",
      "",
      renderSchemaBlock(tool.inputSchema),
      "",
      "</details>",
      "",
      renderOutputSection(tool),
      "",
      renderResponseContractSection(tool),
    );
  }

  return lines;
}

export async function main() {
  const pkg = await loadPackageMetadata();
  const { tools, errorExample } = await loadToolDefinitions();
  const content = `${buildDocumentLines(pkg, tools, errorExample).join("\n")}\n`;

  await mkdir(dirname(outputPath), { recursive: true });

  let previousContent = "";
  try {
    previousContent = await readFile(outputPath, "utf8");
  } catch {
    // File may not exist yet.
  }

  if (previousContent === content) {
    console.log(`No changes in ${outputPath}`);
    return;
  }

  await writeFile(outputPath, content, "utf8");
  console.log(`Wrote ${outputPath}`);
}

function isDirectRun() {
  if (!process.argv[1]) {
    return false;
  }
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
