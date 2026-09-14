import { MCPServer, TransportConfig } from "mcp-framework";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import logger from "./logger.js";
import { getEnv } from "./config/env.js";


// --- Entry Point ---
//
// This is the MCP server entry point (stdio or http). The stateless geodata proxy
// runs as a SEPARATE process/image with its own entry point (src/proxy/index.ts),
// so the two can be deployed and scaled independently. They only share the
// PROXY_URL_SECRET (the MCP layer tool encodes the token, the proxy decodes it).

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const env = getEnv();

  // In http mode the MCP exposes the layer tool, which encodes proxy URLs, so it
  // needs the shared secret and the public base URL up front. In stdio (local
  // npx) neither is required.
  if (env.TRANSPORT_TYPE === "http") {
    if (!env.PROXY_URL_SECRET) {
      throw new Error("PROXY_URL_SECRET is required in http mode (the layer tool signs proxy URLs).");
    }
    if (!env.PROXY_PUBLIC_BASE_URL) {
      throw new Error("PROXY_PUBLIC_BASE_URL is required in http mode (used to build the layer data_url).");
    }
  }

  const transport = buildTransport(env);
  const version = getVersion();

  const mcpServer = new MCPServer({
    name: "geocontext",
    version,
    basePath: __dirname,
    transport,
  });

  await assertAllToolModulesLoad(__dirname);

  await mcpServer.start();
}

// --- Helpers ---

/**
 * Build the transport configuration for the MCP server based on the environment.
 */
function buildTransport(env: ReturnType<typeof getEnv>): TransportConfig {
  
  if (env.TRANSPORT_TYPE === "stdio") {
    return {
      type: "stdio",
    };
  }

  if (!env.HTTP_CORS_ALLOWED_ORIGINS) {
    logger.warn('Security : HTTP_CORS_ALLOWED_ORIGINS is not set. It is recommended to set this variable to prevent DNS rebinding attacks (e.g., HTTP_CORS_ALLOWED_ORIGINS="http://localhost:3000,https://geollm.beta.ign.fr".');
  }

  return {
    type: "http-stream",
    options: {
      port: env.HTTP_PORT,
      endpoint: env.HTTP_MCP_ENDPOINT,
      responseMode: "stream",
      cors: {
        allowOrigin: "*",
        allowedOrigins: env.HTTP_CORS_ALLOWED_ORIGINS,
      },
      host: env.HTTP_HOST,
    },
  };
}

/**
 * Get the version from package.json for the MCP server metadata.
 */
function getVersion(): string {
  const require = createRequire(import.meta.url);
  const { version } = require("../package.json") as { version: string };
  return version;
}

/**
 * Ensures every tool module discovered in dist/tools can be imported.
 * Fails fast to avoid a "ready" server with a partial tool registry.
 */
async function assertAllToolModulesLoad(basePath: string): Promise<void> {
  const toolsDir = join(basePath, "tools");
  const entries = await readdir(toolsDir, { withFileTypes: true });
  const toolModuleNames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith("Tool.js") && name !== "BaseTool.js");

  if (toolModuleNames.length === 0) {
    throw new Error(`No tool modules found in '${toolsDir}'.`);
  }

  const failedModules: Array<{ moduleName: string; reason: string }> = [];
  for (const moduleName of toolModuleNames) {
    const modulePath = join(toolsDir, moduleName);
    try {
      await import(pathToFileURL(modulePath).href);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failedModules.push({ moduleName, reason });
    }
  }

  if (failedModules.length > 0) {
    throw new Error(
      `Tool preflight failed (${toolModuleNames.length - failedModules.length}/${toolModuleNames.length} importable). Failed modules: ${failedModules.map(({ moduleName }) => moduleName).join(", ")}`,
    );
  }
}

main().catch((error) => {
  console.error(
    "Fatal error in main():",
    error instanceof Error ? error.stack : String(error)
  );
  process.exit(1);
});
