/**
 * Configuration for integration tests.
 *
 * Environment variables:
 * - GEOCONTEXT_SERVER_PATH: path to the built server entry point (default: "dist/index.js")
 * - HTTP_PROXY / HTTPS_PROXY / NO_PROXY: proxy settings forwarded to the server
 * - GEOCONTEXT_LOG_LEVEL: log level for the server (default: "error")
 */

import { resolve } from "node:path";

export const MILLISECONDS = 1000;
export const PROXY_ENV_KEYS = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
] as const;
export const NO_PROXY_ENV_KEYS = [
  "NO_PROXY",
  "no_proxy",
] as const;

export const INTEGRATION_CONFIG = {

  /** Timeout for each test involving real API calls (60 s) */
  timeout: 60 * MILLISECONDS,

  /** Timeout for the server startup / connection (30 s) */
  connectTimeout: 30 * MILLISECONDS,

  /** Command used to start the geocontext MCP server */
  serverCommand: process.execPath,
  serverArgs: [resolve(process.cwd(), process.env.GEOCONTEXT_SERVER_PATH ?? "dist/index.js")],

  /** Environment variables forwarded to the server child process */
  // TODO: we might want to add some more variables here in the future 
  // (e.g. for minisearch weights for example)
  serverEnv(): Record<string, string> {
    const env: Record<string, string> = {
      LOG_LEVEL: process.env.GEOCONTEXT_LOG_LEVEL ?? "error",
      NODE_USE_ENV_PROXY: "1",
    };
    for (const key of [...PROXY_ENV_KEYS, ...NO_PROXY_ENV_KEYS]) {
      const value = process.env[key];
      if (value) {
        env[key] = value;
      }
    }
    return env;
  },
} as const;
