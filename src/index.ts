#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import logger from "./logger.js";
import { getEnv } from "./config/env.js";
import { startHttpServer } from "./http.js";
import { createServer } from "./server.js";


// --- Entry Point ---
//
// This is the MCP server entry point (stdio or http). The stateless geodata proxy
// runs as a SEPARATE process/image with its own entry point (src/proxy/index.ts),
// so the two can be deployed and scaled independently. They only share the
// PROXY_URL_SECRET (the MCP layer tool encodes the token, the proxy decodes it).

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

  if (env.TRANSPORT_TYPE === "stdio") {
    serveStdio(createServer, { onerror: (error) => logger.error(`[stdio] ${error.message}`) });
    return;
  }

  if (!env.HTTP_CORS_ALLOWED_ORIGINS) {
    logger.warn('Security : HTTP_CORS_ALLOWED_ORIGINS is not set. It is recommended to set this variable to prevent DNS rebinding attacks (e.g., HTTP_CORS_ALLOWED_ORIGINS="http://localhost:3000,https://geollm.beta.ign.fr".');
  }

  const server = await startHttpServer();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      logger.info(`[http] received ${signal}, shutting down ...`);
      server.close();
      setTimeout(() => {
        logger.warn("[http] drain exceeded 8 s, forcing shutdown");
        process.exit(0);
      }, 8000).unref();
    });
  }
}

main().catch((error) => {
  console.error(
    "Fatal error in main():",
    error instanceof Error ? error.stack : String(error)
  );
  process.exit(1);
});
