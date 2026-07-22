#!/usr/bin/env node
/**
 * Entry point for the stateless geodata proxy server.
 *
 * Runs as a SEPARATE process/image from the MCP server so the two can be deployed
 * and scaled independently. The proxy is always HTTP; it shares only the
 * PROXY_URL_SECRET with the MCP (the MCP layer tool encodes the token, the proxy
 * decodes it).
 *
 * The `#!/usr/bin/env node` shebang above is preserved verbatim by tsc into the
 * emitted dist/proxy/index.js, so the `geocontext-proxy` npm bin (symlinked and
 * executed directly on POSIX) resolves its interpreter. tsc can PRESERVE a source
 * shebang but has no option to ADD one (TS issue #45319), and mcp-build only
 * shebangs dist/index.js — hence putting it in the source is the declarative fix.
 */

import logger from "../logger.js";
import { getEnv } from "../config/env.js";
import { startProxyServer } from "./server.js";

async function main() {
  const env = getEnv();

  if (!env.PROXY_URL_SECRET) {
    throw new Error("PROXY_URL_SECRET is required to run the proxy (it decodes the layer token).");
  }

  const server = await startProxyServer();

  // Bound the graceful drain so a slow in-flight WFS query or an idle keep-alive
  // socket cannot hold the process past the orchestrator's kill grace period
  // (Docker/k8s default 10s → SIGKILL). Slightly under that so we exit cleanly.
  const SHUTDOWN_GRACE_MS = 8000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info(`[proxy] received ${signal}, shutting down ...`);

    // Stop accepting new connections and let in-flight requests finish; drop
    // idle keep-alive sockets right away so they don't hold close() open.
    server.close(() => {
      // Safe despite `forceExit` being declared below: this callback runs only
      // after the async drain completes, long after `forceExit` is initialised.
      clearTimeout(forceExit);
      logger.info("[proxy] closed");
      process.exit(0);
    });
    server.closeIdleConnections();

    // Fallback: if the drain does not complete in time, force-close remaining
    // sockets and exit anyway rather than waiting for SIGKILL.
    const forceExit = setTimeout(() => {
      logger.warn(`[proxy] drain exceeded ${SHUTDOWN_GRACE_MS} ms, forcing shutdown`);
      server.closeAllConnections();
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error(
    "Fatal error in proxy main():",
    error instanceof Error ? error.stack : String(error),
  );
  process.exit(1);
});
