import { MCPServer, TransportConfig } from "mcp-framework";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import logger from "./logger.js";
import { getEnv } from "./config/env.js";


// --- Entry Point ---

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const env = getEnv();
  const transport = buildTransport(env);
  const version = getVersion();

  const mcpServer = new MCPServer({
    name: "geocontext",
    version,
    basePath: __dirname,
    transport,
  });

  await mcpServer.start();
}

main().catch((error) => {
  console.error(
    "Fatal error in main():",
    error instanceof Error ? error.stack : String(error)
  );
  process.exit(1);
});


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
