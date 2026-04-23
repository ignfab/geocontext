import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonSchema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

type ToolDefinition = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const toolsDir = join(repoRoot, "src", "tools");
const outputPath = join(repoRoot, "docs", "mcp-tools.md");

function formatInline(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function schemaType(schema: JsonSchema | undefined): string {
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

function renderPropertyTable(schema: JsonSchema | undefined) {
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

function renderSchemaBlock(schema: JsonSchema | undefined) {
  if (!schema) {
    return "_No JSON Schema exposed by this tool definition._";
  }

  return `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
}

function renderOutputSection(definition: ToolDefinition) {
  if (definition.outputSchema) {
    return [
      "### Output",
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
  ) as { name?: string; version?: string };

  return {
    name: packageJson.name ?? "unknown",
    version: packageJson.version ?? "unknown",
  };
}

async function loadToolDefinitions() {
  const filenames = (await readdir(toolsDir))
    .filter((filename) => filename.endsWith("Tool.ts"))
    .sort((left, right) => left.localeCompare(right));

  const definitions: Array<ToolDefinition & { source: string }> = [];

  for (const filename of filenames) {
    const moduleUrl = pathToFileURL(join(toolsDir, filename)).href;
    const imported = await import(moduleUrl);
    const ToolClass = imported.default;

    if (typeof ToolClass !== "function") {
      throw new Error(`Default export in ${filename} is not a tool class.`);
    }

    const instance = new ToolClass();
    definitions.push({
      source: `src/tools/${filename}`,
      ...instance.toolDefinition,
    });
  }

  return definitions.sort((left, right) => left.name.localeCompare(right.name));
}

async function main() {
  const pkg = await loadPackageMetadata();
  const tools = await loadToolDefinitions();

  const lines: string[] = [
    "# MCP Tool Reference",
    "",
    `Generated from runtime \`toolDefinition\` metadata for \`${pkg.name}\` v${pkg.version}.`,
    "",
    "## Index",
    "",
    ...tools.map((tool) => `- [\`${tool.name}\`](#${tool.name.toLowerCase()})`),
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
      tool.description ?? "_No description provided._",
      "",
      "### Input",
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

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
