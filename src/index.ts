import { MCPServer, TransportConfig } from "mcp-framework";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

type TransportType = "stdio" | "http";

function isTransportType(value: string): value is TransportType {
  return value === "stdio" || value === "http";
}

function getTransportType(): TransportType {
  const transportType = process.env.TRANSPORT_TYPE ?? "stdio";

  if (!isTransportType(transportType)) {
    throw new Error(`Invalid transport type: ${transportType}`);
  }

  return transportType;
}

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
      },
      host,
    },
  };
}

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
