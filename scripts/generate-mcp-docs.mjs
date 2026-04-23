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
    return "_No description provided._";
  }

  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return lines[0] ?? "_No description provided._";
  }

  return lines.map((line) => `- ${line}`).join("\n");
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
    return schema.type.join(" | ");
  }
  if (schema.type) {
    return schema.type;
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
    return "_No top-level properties documented._";
  }

  const required = new Set(schema?.required ?? []);
  const rows = Object.entries(properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, propertySchema]) => {
      const type = schemaType(propertySchema);
      const enumValues = propertySchema.enum?.length
        ? ` Values: ${propertySchema.enum.map(formatInline).join(", ")}.`
        : "";
      const defaultValue =
        propertySchema.default !== undefined
          ? ` Default: ${formatInline(propertySchema.default)}.`
          : "";
      const description = `${propertySchema.description ?? ""}${enumValues}${defaultValue}`.trim();

      return `| \`${escapeCell(name)}\` | ${escapeCell(type || " ")} | ${required.has(name) ? "yes" : "no"} | ${escapeCell(description || " ")} |`;
    });

  return [
    "| Field | Type | Required | Description |",
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
    return "_No JSON Schema exposed by this tool definition._";
  }

  return `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
}

/**
 * @param {ToolDefinition} definition
 * @returns {string}
 */
export function renderOutputSection(definition) {
  if (definition.outputSchema) {
    return [
      "### Output Schema",
      "",
      renderPropertyTable(definition.outputSchema),
      "",
      "<details>",
      "<summary>Raw output schema</summary>",
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
    ? `No single \`outputSchema\` is exposed. Output depends on \`result_type\` (${modes.join(", ")}).`
    : "No single `outputSchema` is exposed. Output is handled by the framework default serialization or custom response formatting.";

  return ["### Output", "", note].join("\n");
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

async function loadToolDefinitions() {
  await ensureCompiledToolsExist();
  normalizePotentiallyInvalidEnv();

  const filenames = (await readdir(compiledToolsDir))
    .filter((filename) => filename.endsWith("Tool.js"))
    .sort((left, right) => left.localeCompare(right));

  if (filenames.length === 0) {
    throw new Error(`No tool modules found in ${compiledToolsDir}. Run \`npm run build\` first.`);
  }

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

  return definitions.sort((left, right) => left.name.localeCompare(right.name));
}

function buildDocumentLines(pkg, tools) {
  const lines = [
    "# MCP Tool Reference",
    "",
    `Generated from runtime \`toolDefinition\` metadata for \`${pkg.name}\` v${pkg.version}.`,
    "",
    "## Index",
    "",
    ...tools.map((tool) => `- [\`${tool.name}\`](#${toAnchorSlug(tool.name)})`),
  ];

  for (const tool of tools) {
    lines.push(
      "",
      `## \`${tool.name}\``,
      "",
      `Source: [${tool.source}](../${tool.source})`,
      "",
      `Title: ${tool.title ?? ""}`,
      "",
      "### Description du tool",
      "",
      renderDescription(tool.description),
      "",
      "### Input Schema",
      "",
      renderPropertyTable(tool.inputSchema),
      "",
      "<details>",
      "<summary>Raw input schema</summary>",
      "",
      renderSchemaBlock(tool.inputSchema),
      "",
      "</details>",
      "",
      renderOutputSection(tool),
    );
  }

  return lines;
}

export async function main() {
  const pkg = await loadPackageMetadata();
  const tools = await loadToolDefinitions();
  const content = `${buildDocumentLines(pkg, tools).join("\n")}\n`;

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
