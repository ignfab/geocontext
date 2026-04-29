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

function buildTransport(transportType: TransportType) : TransportConfig {
  // Handle stdio transport configuration
  if (transportType === "stdio") {
    return {
      type: "stdio",
    };
  }

  // Handle HTTP transport configuration

  const host = process.env.HTTP_HOST?.trim() || '127.0.0.1';
  const endpoint = process.env.HTTP_MCP_ENDPOINT?.trim() || '/mcp';
  const port = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 3000;

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
