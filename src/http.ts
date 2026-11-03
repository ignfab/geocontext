/**
 * Streamable HTTP server for the MCP endpoint.
 *
 * Fully stateless: every request is answered by a fresh MCP server (no session),
 * so any replica can serve any request.
 */

import { once } from "node:events";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

import logger from "./logger.js";
import { getEnv } from "./config/env.js";
import { createServer } from "./server.js";

// --- Request Handler ---

/**
 * Normalizes an origin as `scheme://host[:port]` (lowercase, default port dropped).
 * Unlike `URL.origin`, which is "null" for them, keeps the non-http schemes.
 *
 * @returns The normalized origin, or `null` when `origin` is not a URL.
 */
function normalizeOrigin(origin: string) {
  const url = URL.parse(origin);
  return url && `${url.protocol}//${url.host}`.toLowerCase();
}

/**
 * Builds the request handler: Origin check, CORS, `/health` and the MCP endpoint.
 *
 * Exported separately from {@link startHttpServer} so tests can drive it
 * without binding a port.
 */
export function createRequestHandler() {
  const env = getEnv();

  const onerror = (error: Error) => logger.error(`[http] ${error.message}`);
  // The 2025-era transports report the client errors (406, 415, invalid JSON...)
  // to their per-request server only.
  const factory = () => {
    const server = createServer();
    server.server.onerror = (error) => logger.warn(`[http] ${error.message}`);
    return server;
  };
  const handleMcpRequest = toNodeHandler(createMcpHandler(factory, { onerror }), { onerror });

  // DNS rebinding protection: browser requests must come from an allowed origin
  // (scheme, host and port). Requests without an `Origin` header pass.
  const allowedOrigins = env.HTTP_CORS_ALLOWED_ORIGINS?.map(normalizeOrigin);

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const { origin } = req.headers;
      if (origin && allowedOrigins && !allowedOrigins.includes(normalizeOrigin(origin))) {
        logger.warn(`[http] rejected origin ${origin}`);
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: `Invalid Origin: ${origin}` }, id: null }));
        return;
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Max-Age", "86400");
      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }

      // `URL.parse`: a valid HTTP target that is not a parsable URL (`//`) gets the 404 below.
      const pathname = URL.parse(req.url ?? "/", "http://localhost")?.pathname;

      // Health probe (Kubernetes liveness/readiness), same path and body as the proxy.
      if (pathname === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (pathname === env.HTTP_MCP_ENDPOINT) {
        await handleMcpRequest(req, res);
        // The adapter answers 413 to a body over 4 MiB without reporting it.
        if (res.statusCode === 413) {
          logger.warn("[http] request body too large (413)");
        }
        return;
      }

      res.writeHead(404).end("Not Found");
    } catch (error) {
      logger.error(`[http] unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal Server Error");
      }
    }
  };
}

// --- Lifecycle ---

/**
 * Starts the MCP HTTP server. Resolves once it is listening.
 */
export async function startHttpServer(): Promise<Server> {
  const env = getEnv();
  const server = createHttpServer(createRequestHandler()).listen(env.HTTP_PORT, env.HTTP_HOST);
  await once(server, "listening");
  server.on("error", (error) => logger.error(`[http] ${error.message}`));
  logger.info(`[http] listening on ${env.HTTP_HOST}:${env.HTTP_PORT}${env.HTTP_MCP_ENDPOINT}`);
  return server;
}
