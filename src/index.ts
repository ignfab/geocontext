import { MCPServer } from "mcp-framework";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TRANSPORTS = {
  stdio: {
    type: "stdio",
  },
  http: {
    type: "http-stream",
    options: {
      port: 3000,
      cors: {
        allowOrigin: "*",
      },
    },
  },
} as const;

type TransportType = keyof typeof TRANSPORTS;

function isTransportType(value: string): value is TransportType {
  return Object.prototype.hasOwnProperty.call(TRANSPORTS, value);
}

function getTransportType(): TransportType {
  const transportType = process.env.TRANSPORT_TYPE ?? "stdio";

  if (!isTransportType(transportType)) {
    throw new Error(`Invalid transport type: ${transportType}`);
  }

  return transportType;
}

function buildTransport(transportType: TransportType) {
  if (transportType !== "http") {
    return TRANSPORTS[transportType];
  }

  const host = process.env.HTTP_HOST?.trim();
  if (!host) {
    return TRANSPORTS.http;
  }

  return {
    ...TRANSPORTS.http,
    options: {
      ...TRANSPORTS.http.options,
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
