import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";

import { registerTool, type McpTool } from "./helpers/tools.js";
import AdminexpressTool from "./tools/AdminexpressTool.js";
import AltitudeTool from "./tools/AltitudeTool.js";
import AssietteSupTool from "./tools/AssietteSupTool.js";
import CadastreTool from "./tools/CadastreTool.js";
import DistanceTool from "./tools/DistanceTool.js";
import GeocodeTool from "./tools/GeocodeTool.js";
import GpfCountFeaturesTool from "./tools/GpfCountFeaturesTool.js";
import GpfDescribeTypeTool from "./tools/GpfDescribeTypeTool.js";
import GpfGetFeatureByIdLayerTool from "./tools/GpfGetFeatureByIdLayerTool.js";
import GpfGetFeatureByIdTool from "./tools/GpfGetFeatureByIdTool.js";
import GpfGetFeaturesLayerTool from "./tools/GpfGetFeaturesLayerTool.js";
import GpfGetFeaturesTool from "./tools/GpfGetFeaturesTool.js";
import GpfSearchTypesTool from "./tools/GpfSearchTypesTool.js";
import UrbanismeTool from "./tools/UrbanismeTool.js";

/**
 * Tools exposed by the MCP server.
 *
 * The order is kept by `tools/list` and by docs/mcp-tools.md.
 */
export const tools: McpTool[] = [
  new GeocodeTool(),
  new AltitudeTool(),
  new AdminexpressTool(),
  new CadastreTool(),
  new UrbanismeTool(),
  new AssietteSupTool(),
  new GpfSearchTypesTool(),
  new GpfDescribeTypeTool(),
  new GpfGetFeaturesTool(),
  new GpfGetFeaturesLayerTool(),
  new GpfCountFeaturesTool(),
  new GpfGetFeatureByIdTool(),
  new GpfGetFeatureByIdLayerTool(),
  new DistanceTool(),
];

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

// The tool definitions only change with a release: 2026-07-28 clients (and
// shared caches) may reuse them for an hour.
const CACHE_HINT = { ttlMs: 60 * 60 * 1000, cacheScope: "public" } as const;

/**
 * Creates an MCP server exposing every tool.
 *
 * The server holds no state: the transports may create one per connection
 * (stdio) or per request (http).
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: "geocontext", version },
    {
      // The tool list never changes while the server runs.
      capabilities: { tools: { listChanged: false } },
      cacheHints: { "server/discover": CACHE_HINT, "tools/list": CACHE_HINT },
    },
  );
  for (const tool of tools) {
    registerTool(server, tool);
  }
  return server;
}
