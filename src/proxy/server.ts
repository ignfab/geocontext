/**
 * Stateless WFS proxy HTTP server.
 *
 * Serves `GET {PROXY_ENDPOINT}?q=<token>`: decode the opaque token, re-validate
 * it through the layer schema, run the geometry-full WFS query, and return a
 * GeoJSON FeatureCollection for MCP Carto to render.
 *
 * mcp-framework's HTTP server is a hardcoded router with no route hook, so the
 * proxy runs as a SEPARATE `node:http` listener in the same process (http mode
 * only), started from `main()`.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import logger from "../logger.js";
import { getEnv } from "../config/env.js";
import { GPF_WFS_URL } from "../wfs/catalog.js";
import {
  gpfGetFeaturesLayerInputSchema,
  gpfGetFeatureByIdLayerInputObjectSchema,
  PROXY_TOKEN_KIND,
} from "../wfs/schema.js";
import { runGeometryFeatureQuery, runGeometryFeatureByIdQuery } from "./execute.js";
import { FeatureNotFoundError, FeatureCardinalityError } from "../wfs/byId.js";
import {
  getDefaultGeometryFeatureQueryDeps,
  getDefaultGeometryFeatureByIdQueryDeps,
} from "./transport.js";
import {
  decodeToken,
  ProxyTokenMalformedError,
  ProxyTokenTamperedError,
  ProxyTokenTooLargeError,
} from "./token.js";
import { ResponseTooLargeError, ServiceResponseError } from "../helpers/http.js";
import { ZodError } from "zod";

// --- Error → HTTP status mapping ---

type HttpError = { status: number; detail: string };

/**
 * Maps a thrown error to an HTTP status + client-facing detail. Never leaks a
 * stack; never returns a GeoJSON-shaped body (Carto would mis-render a 200).
 */
function toHttpError(error: unknown): HttpError {
  if (error instanceof ProxyTokenTooLargeError) {
    return { status: 413, detail: error.message };
  }
  if (error instanceof ProxyTokenMalformedError || error instanceof ProxyTokenTamperedError) {
    return { status: 400, detail: "Jeton de requête invalide." };
  }
  if (error instanceof ZodError) {
    return { status: 400, detail: "Paramètres de couche invalides." };
  }
  if (error instanceof ResponseTooLargeError) {
    return { status: 413, detail: error.message };
  }
  if (error instanceof FeatureNotFoundError) {
    // Client asked for a feature_id that does not exist: a genuine not-found.
    // Fixed FR message; the internal detail (typename/id) is logged, not leaked.
    return { status: 404, detail: "Objet introuvable pour cet identifiant." };
  }
  if (error instanceof FeatureCardinalityError) {
    // The client request was valid but the upstream WFS broke the single-feature
    // contract (duplicate / id mismatch / unusable body): an upstream anomaly.
    return { status: 502, detail: "Le service WFS a renvoyé une réponse incohérente pour cet objet." };
  }
  if (error instanceof ServiceResponseError) {
    const upstream = error.httpStatus ?? 502;
    // 4xx from the WFS is a bad request we forwarded; expose as 502 unless it is a
    // timeout (504). Client-provided data already passed validation, so a 4xx here
    // means an upstream contract issue, not a client error on the proxy endpoint.
    const status = upstream === 504 ? 504 : 502;
    // Do NOT forward error.serviceDetail (raw upstream WFS text, English, internal
    // column names) to the client: like the other branches, return a fixed FR
    // message. The upstream detail is logged server-side by the caller.
    const detail =
      status === 504
        ? "Le service WFS n'a pas répondu à temps."
        : "Le service WFS a renvoyé une réponse inexploitable.";
    return { status, detail };
  }
  return { status: 500, detail: "Erreur interne du proxy." };
}

// --- Response helpers ---

/**
 * The proxy serves PUBLIC, stateless GeoJSON from an opaque `?q=` token: no
 * cookies, no session, no per-user data — the response is identical for anyone
 * presenting the same token. CORS only governs whether a browser page may READ
 * the response, so with nothing private to protect a restrictive allowlist adds
 * no security and would only break legitimate browser consumers whose origin we
 * cannot enumerate (MCP Carto, claude.ai, ChatGPT, VSCode webviews, ...). So we
 * open it to any origin, exactly as the MCP transport does (`allowOrigin: "*"`).
 * No `Allow-Credentials` (there are none), so `*` is safe.
 */
function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function sendJsonError(res: ServerResponse, status: number, detail: string): void {
  const body = JSON.stringify({ error: true, detail });
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

/**
 * Narrows a decoded token to a discriminated `{ kind, ...payload }` shape. The
 * decoded value is untrusted (it only passed GCM authentication, not schema
 * validation), so reject anything that is not a plain object carrying a `kind`
 * as a malformed token — mapped to a clean 400, never mis-dispatched.
 */
function asDiscriminatedToken(params: unknown): { kind: unknown; [key: string]: unknown } {
  if (typeof params !== "object" || params === null || !("kind" in params)) {
    throw new ProxyTokenMalformedError("Proxy token is missing its `kind` discriminant.");
  }
  return params as { kind: unknown; [key: string]: unknown };
}

// --- Request handling ---

async function handleLayerRequest(url: URL, res: ServerResponse): Promise<void> {
  const env = getEnv();

  const token = url.searchParams.get("q");
  if (!token) {
    sendJsonError(res, 400, "Paramètre `q` manquant.");
    return;
  }

  // decode → re-validate → run. The secret is guaranteed present because the
  // proxy entry point (src/proxy/index.ts) refuses to start without it, but
  // guard defensively.
  if (!env.PROXY_URL_SECRET) {
    sendJsonError(res, 500, "Proxy mal configuré (clé absente).");
    return;
  }

  let featureCollection: unknown;
  try {
    const params = decodeToken(token, env.PROXY_URL_SECRET);

    // Dispatch on the token's `kind` discriminant (stamped by the producer tool),
    // then strip it so the strict per-kind schema accepts the remaining payload.
    // An unknown/missing kind fails cleanly as a 400 (malformed), never silently
    // mis-dispatched to the query path.
    const { kind, ...payload } = asDiscriminatedToken(params);

    if (kind === PROXY_TOKEN_KIND.byId) {
      const input = gpfGetFeatureByIdLayerInputObjectSchema.parse(payload);
      featureCollection = await runGeometryFeatureByIdQuery(
        input,
        getDefaultGeometryFeatureByIdQueryDeps(),
      );
    } else if (kind === PROXY_TOKEN_KIND.query) {
      const input = gpfGetFeaturesLayerInputSchema.parse(payload);
      featureCollection = await runGeometryFeatureQuery(input, getDefaultGeometryFeatureQueryDeps());
    } else {
      throw new ProxyTokenMalformedError(`Unknown proxy token kind: ${String(kind)}.`);
    }
  } catch (error) {
    const { status, detail } = toHttpError(error);
    // Log the REAL error message server-side (the client detail is a fixed, generic
    // FR string; the upstream/service detail must not leak to the client but is
    // exactly what an operator needs to diagnose, e.g. a desynced embedded catalog).
    const internal = error instanceof Error ? error.message : String(error);
    logger.error(`[proxy] ${status} — ${detail} — ${internal}`);
    sendJsonError(res, status, detail);
    return;
  }

  res.writeHead(200, { "Content-Type": "application/geo+json; charset=utf-8" });
  res.end(JSON.stringify(featureCollection));
}

/**
 * Builds the request handler for the proxy server.
 */
function createRequestHandler() {
  const { PROXY_ENDPOINT } = getEnv();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    applyCors(res);

    // Preflight.
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname !== PROXY_ENDPOINT) {
      sendJsonError(res, 404, "Ressource introuvable.");
      return;
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      sendJsonError(res, 405, "Méthode non autorisée.");
      return;
    }

    try {
      await handleLayerRequest(url, res);
    } catch (error) {
      // Safety net: handleLayerRequest maps its own errors, so this only catches
      // truly unexpected failures.
      logger.error(`[proxy] unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        sendJsonError(res, 500, "Erreur interne du proxy.");
      }
    }
  };
}

// --- Lifecycle ---

/**
 * Starts the proxy HTTP server. Resolves once it is listening; rejects if it
 * fails to bind (the caller treats that as fatal).
 *
 * Host-fixed invariant: the WFS endpoint the proxy talks to is a compile-time
 * constant (`GPF_WFS_URL`), never a client-provided URL — asserted here so a
 * refactor cannot turn the proxy into an open relay.
 */
export function startProxyServer(): Promise<Server> {
  if (new URL(GPF_WFS_URL).host !== "data.geopf.fr") {
    throw new Error(`Invariant violé : l'endpoint WFS du proxy doit être data.geopf.fr (reçu ${GPF_WFS_URL}).`);
  }

  const env = getEnv();
  const server = createServer(createRequestHandler());

  return new Promise<Server>((resolve, reject) => {
    server.once("error", reject);
    server.listen(env.PROXY_PORT, env.HTTP_HOST, () => {
      server.off("error", reject);
      logger.info(`[proxy] listening on ${env.HTTP_HOST}:${env.PROXY_PORT}${env.PROXY_ENDPOINT}`);
      resolve(server);
    });
  });
}
