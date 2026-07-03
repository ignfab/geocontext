import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const compiledToolsDir = join(repoRoot, "dist", "tools");
const outputPath = join(repoRoot, "docs", "mcp-tools.md");
const miniSearchOptionsEnv = "GPF_WFS_MINISEARCH_OPTIONS";
const toolDisplayOrder = [
  "geocode",
  "altitude",
  "adminexpress",
  "cadastre",
  "urbanisme",
  "assiette_sup",
  "gpf_search_types",
  "gpf_describe_type",
  "gpf_get_feature_by_id",
  "gpf_get_features",
  "gpf_count_features"
];

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

/**
 * @typedef {ToolDefinition & {source: string, _instance: import("mcp-framework").MCPTool}} LoadedTool
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
    structuredContent: "oui",
    relation: "`content[0].text` contient `structuredContent.detail`, pas le JSON d'erreur complet de `structuredContent`.",
  };

  if (definition.name === "gpf_get_features") {
    return [
      "### Réponse MCP",
      "",
      renderResponseContractTable([
        {
          caseName: 'Succès `result_type="results"`',
          content: "oui",
          structuredContent: "non",
          relation: "`content[0].text` est la FeatureCollection stringifiée ; aucun `structuredContent` n'est ajouté dans ce mode.",
        },
        {
          caseName: 'Succès `result_type="http_post_request"`',
          content: "oui",
          structuredContent: "oui",
          relation: "`content[0].text` est `JSON.stringify(structuredContent)`.",
        },
        {
          caseName: 'Succès `result_type="http_get_url"`',
          content: "oui",
          structuredContent: "oui",
          relation: "`content[0].text` est `JSON.stringify(structuredContent)`.",
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
          caseName: 'Succès `result_type="results"`',
          content: "oui",
          structuredContent: "oui",
          relation: "`content[0].text` est `JSON.stringify(structuredContent)`.",
        },
        {
          caseName: 'Succès `result_type="http_post_request"`',
          content: "oui",
          structuredContent: "oui",
          relation: "`content[0].text` est `JSON.stringify(structuredContent)`.",
        },
        {
          caseName: 'Succès `result_type="http_get_url"`',
          content: "oui",
          structuredContent: "oui",
          relation: "`content[0].text` est `JSON.stringify(structuredContent)`.",
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

  const modes =
    definition.inputSchema?.properties?.result_type?.enum?.map((value) => `\`${String(value)}\``) ??
    [];

  const note = modes.length
    ? `Aucun \`outputSchema\` unique n'est exposé. La sortie dépend de \`result_type\` (${modes.join(", ")}).`
    : "Aucun `outputSchema` unique n'est exposé. La sortie est gérée par la sérialisation par défaut du framework ou par un formatage de réponse spécifique.";

  return ["### Sortie", "", note].join("\n");
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

async function ensureCompiledToolsExist() {
  try {
    await access(compiledToolsDir, fsConstants.R_OK);
  } catch {
    throw new Error(
      `Missing compiled tools directory: ${compiledToolsDir}. Run \`npm run build\` before \`npm run docs:mcp\`.`,
    );
  }
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
 * @param {unknown} definition
 * @param {string} filename
 */
function assertToolDefinition(definition, filename) {
  if (!definition || typeof definition !== "object") {
    throw new Error(`Tool ${filename} did not expose a toolDefinition object.`);
  }
  if (typeof definition.name !== "string" || definition.name.trim() === "") {
    throw new Error(`Tool ${filename} exposed an invalid toolDefinition.name.`);
  }
}

function sourcePathForCompiledTool(filename) {
  return `src/tools/${filename.replace(/\.js$/, ".ts")}`;
}

export function sortToolDefinitions(definitions) {
  const order = new Map(toolDisplayOrder.map((name, index) => [name, index]));

  return definitions.sort((left, right) => {
    const leftOrder = order.get(left.name);
    const rightOrder = order.get(right.name);

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) {
      return -1;
    }
    if (rightOrder !== undefined) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  });
}

async function loadToolDefinitions() {
  await ensureCompiledToolsExist();
  normalizePotentiallyInvalidEnv();

  const filenames = (await readdir(compiledToolsDir))
    .filter((filename) => filename.endsWith("Tool.js"))
    .filter((filename) => filename !== "BaseTool.js")
    .sort((left, right) => left.localeCompare(right));

  if (filenames.length === 0) {
    throw new Error(`No tool modules found in ${compiledToolsDir}. Run \`npm run build\` first.`);
  }

  /** @type {LoadedTool[]} */
  const definitions = [];

  for (const filename of filenames) {
    const moduleUrl = pathToFileURL(join(compiledToolsDir, filename)).href;
    const imported = await import(moduleUrl);
    const ToolClass = imported.default;

    if (typeof ToolClass !== "function") {
      throw new Error(`Default export in ${filename} is not a tool class.`);
    }

    const instance = new ToolClass();
    assertToolDefinition(instance.toolDefinition, filename);
    definitions.push({
      source: sourcePathForCompiledTool(filename),
      _instance: instance,
      ...instance.toolDefinition,
    });
  }

  const duplicateNames = definitions
    .map((definition) => definition.name)
    .filter((name, index, names) => names.indexOf(name) !== index);

  if (duplicateNames.length > 0) {
    throw new Error(
      `Duplicate MCP tool names detected: ${Array.from(new Set(duplicateNames)).join(", ")}.`,
    );
  }

  return sortToolDefinitions(definitions);
}

function normalizeErrorResponse(response) {
  if (!response || typeof response !== "object") {
    return undefined;
  }

  const source = /** @type {Record<string, unknown>} */ (response);
  if (source.isError !== true || !Array.isArray(source.content)) {
    return undefined;
  }

  return {
    isError: true,
    content: source.content,
    ...(source.structuredContent !== undefined ? { structuredContent: source.structuredContent } : {}),
  };
}

async function loadNormalizeToolError() {
  const moduleUrl = pathToFileURL(join(repoRoot, "dist", "errors", "toolError.js")).href;
  const imported = await import(moduleUrl);

  if (typeof imported.normalizeToolError !== "function") {
    throw new Error("Compiled helper normalizeToolError was not found.");
  }

  return imported.normalizeToolError;
}

/**
 * @param {JsonSchema | undefined} schema
 * @returns {unknown}
 */
export function buildInvalidValue(schema) {
  const type = schemaType(schema);

  if (type.includes("number") || type.includes("integer")) {
    return "invalid";
  }
  if (type.includes("string") || type === "enum") {
    return 123;
  }
  if (type.includes("boolean")) {
    return "invalid";
  }
  if (type.includes("array")) {
    return "invalid";
  }
  if (type.includes("object") || type.includes("oneOf") || type.includes("anyOf") || type.includes("allOf")) {
    return "invalid";
  }

  return null;
}

/**
 * @param {ToolDefinition} definition
 * @returns {Record<string, unknown>[]}
 */
export function buildInvalidInputCandidates(definition) {
  const candidates = [{}];
  const properties = definition.inputSchema?.properties;

  if (properties && Object.keys(properties).length > 0) {
    const firstFieldName = Object.keys(properties).sort((left, right) => left.localeCompare(right))[0];
    candidates.push({
      [firstFieldName]: buildInvalidValue(properties[firstFieldName]),
    });
  }

  candidates.push({
    __invalid_parameter__: true,
  });

  return candidates;
}

/**
 * @param {LoadedTool} tool
 * @param {(error: unknown) => Record<string, unknown>} normalizeToolError
 * @returns {{ toolName: string, response: ReturnType<typeof normalizeErrorResponse> } | undefined}
 */
export function buildValidationErrorExampleForTool(tool, normalizeToolError) {
  const schema = tool._instance?.schema;

  if (!schema || typeof schema.safeParse !== "function") {
    return undefined;
  }

  for (const candidate of buildInvalidInputCandidates(tool)) {
    const result = schema.safeParse(candidate);

    if (result.success) {
      continue;
    }

    const payload = normalizeToolError(result.error);
    const response = normalizeErrorResponse({
      isError: true,
      content: [
        {
          type: "text",
          text: String(payload.detail ?? "Erreur de validation."),
        },
      ],
      structuredContent: payload,
    });

    if (!response) {
      return undefined;
    }

    return {
      toolName: tool.name,
      response,
    };
  }

  return undefined;
}

async function buildErrorExample(tools) {
  const normalizeToolError = await loadNormalizeToolError();

  for (const tool of tools) {
    const errorExample = buildValidationErrorExampleForTool(tool, normalizeToolError);
    if (errorExample) {
      return errorExample;
    }
  }

  return undefined;
}

async function buildErrorContractSection(tools) {
  const errorExample = await buildErrorExample(tools);
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
    "- `content.text` contient le message de détail en français (aligné avec `structuredContent.detail`).",
    "- `structuredContent` contient l'objet canonique exploitable par un client.",
    "",
    "Exemple complet généré automatiquement à partir d'un appel de tool invalide (contrainte de validation) :",
    "",
    "```json",
    JSON.stringify(errorExampleWithJsonRpcEnvelope, null, 2),
    "```",
  ];
}

export function buildAnnotationsSection(tools) {
  const annotations = tools.map((tool) => tool.annotations);
  const hasSharedAnnotations =
    annotations.length > 0 &&
    annotations.every((annotation) => JSON.stringify(annotation) === JSON.stringify(annotations[0]));

  if (!hasSharedAnnotations || !annotations[0]) {
    return [];
  }

  return [
    "## Annotations MCP",
    "",
    "Tous les tools exposent les mêmes annotations MCP dans leur définition `tools/list` :",
    "",
    "| Annotation | Valeur | Signification |",
    "| --- | --- | --- |",
    `| \`readOnlyHint\` | ${annotations[0].readOnlyHint ? "oui" : "non"} | Le tool consulte des données sans modifier d'état côté serveur. |`,
    `| \`destructiveHint\` | ${annotations[0].destructiveHint ? "oui" : "non"} | Le tool n'est pas signalé comme destructif. |`,
    `| \`idempotentHint\` | ${annotations[0].idempotentHint ? "oui" : "non"} | Répéter le même appel ne déclenche pas d'effet de bord supplémentaire attendu. |`,
    `| \`openWorldHint\` | ${annotations[0].openWorldHint ? "oui" : "non"} | Le tool interroge des sources externes ou ouvertes, dont le contenu peut évoluer. |`,
  ];
}

async function buildDocumentLines(pkg, tools) {
  const errorContractSection = await buildErrorContractSection(tools);
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
  const tools = await loadToolDefinitions();
  const content = `${(await buildDocumentLines(pkg, tools)).join("\n")}\n`;

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
