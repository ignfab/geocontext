import { MCPServer, TransportConfig, logger } from "mcp-framework";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

type TransportType = "stdio" | "http";

function isTransportType(value: string): value is TransportType {
  return value === "stdio" || value === "http";
}

/**
 * Get the transport type from the environment variable TRANSPORT_TYPE. 
 * Valid values are "stdio" and "http". If not set, defaults to "stdio".
 */
function getTransportType(): TransportType {
  const transportType = process.env.TRANSPORT_TYPE ?? "stdio";

  if (!isTransportType(transportType)) {
    throw new Error(`Invalid transport type: ${transportType}`);
  }

  return transportType;
}

/**
 * Get the HTTP port from the environment variable HTTP_PORT.
 * The variable should be a decimal integer between 1 and 65535. If not set, defaults to 3000.
 */
function getHttpPort(): number {
  const rawPort = process.env.HTTP_PORT?.trim();
  const invalidHttpPortMessage = `Invalid HTTP_PORT: ${rawPort}. Expected a decimal integer between 1 and 65535.`;

  if (!rawPort) {
    return 3000;
  }

  if (!/^\d+$/.test(rawPort)) {
    throw new Error(invalidHttpPortMessage);
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(invalidHttpPortMessage);
  }

  return port;
}

/**
 * Get CORS allowed origins from the environment variable HTTP_CORS_ALLOWED_ORIGINS.
 * The variable should be a comma-separated list of origins .
 */
function getCorsAllowedOrigins(): undefined|string[] {
  if ( ! process.env.HTTP_CORS_ALLOWED_ORIGINS ) {
    logger.warn('Security : HTTP_CORS_ALLOWED_ORIGINS is not set. It is recommended to set this variable to prevent DNS rebinding attacks (e.g., HTTP_CORS_ALLOWED_ORIGINS="http://localhost:3000,https://geollm.beta.ign.fr".');
    return undefined;
  }

  const rawOrigins = process.env.HTTP_CORS_ALLOWED_ORIGINS?.trim();

  if (!rawOrigins) {
    return undefined;
  }

  return rawOrigins.split(",").map((origin) => origin.trim());
}


function buildTransport(transportType: TransportType): TransportConfig {
  // Handle stdio transport configuration
  if (transportType === "stdio") {
    return {
      type: "stdio",
    };
  }

  // Handle HTTP transport configuration

  const host = process.env.HTTP_HOST?.trim() || '127.0.0.1';
  const endpoint = process.env.HTTP_MCP_ENDPOINT?.trim() || '/mcp';
  const port = getHttpPort();

  return {
    type: "http-stream",
    options: {
      port: port,
      endpoint,
      cors: {
        allowOrigin: "*",
        allowedOrigins: getCorsAllowedOrigins(),
      },
      host,
    },
  };
}

/**
 * Get the version from package.json for the MCP server metadata.
 */
function getVersion(): string {
  const pkgMetadata = JSON.parse(
    readFileSync(join(__dirname, "../package.json"), "utf-8")
  );

  if (!pkgMetadata?.version || typeof pkgMetadata.version !== "string") {
    throw new Error("Missing or invalid version in package.json");
  }

  return pkgMetadata.version;
}

async function main() {
  const transportType = getTransportType();
  const transport = buildTransport(transportType);
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
