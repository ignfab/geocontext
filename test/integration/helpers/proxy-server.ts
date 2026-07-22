/**
 * Boots the geocontext server in HTTP mode as a child process so the stateless
 * WFS proxy listener can be exercised end-to-end against the live Géoplateforme.
 *
 * The MCP HTTP transport and the proxy listener share one process; this fixture
 * provides the proxy base URL and a shared PROXY_URL_SECRET so the test can mint
 * a token the running server will decode.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

import { PROXY_ENV_KEYS, NO_PROXY_ENV_KEYS } from "../config/shared.js";

export interface ProxyServerHandle {
  /** Base URL of the proxy listener (e.g. http://127.0.0.1:3099). */
  baseUrl: string;
  /** Proxy layer endpoint path. */
  endpoint: string;
  /** 32-byte key (as a Buffer) shared with the running server, to mint tokens. */
  key: Buffer;
  /** Stops the server child process. */
  cleanup: () => Promise<void>;
}

const HOST = "127.0.0.1";
const PROXY_PORT = 3099;
const ENDPOINT = "/api/v1/proxy-test";

/**
 * Starts the standalone proxy process and waits until its endpoint responds.
 */
export async function startProxyServer(): Promise<ProxyServerHandle> {
  const key = randomBytes(32);
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    HTTP_HOST: HOST,
    PROXY_PORT: String(PROXY_PORT),
    PROXY_ENDPOINT: ENDPOINT,
    PROXY_URL_SECRET: key.toString("hex"),
    LOG_LEVEL: process.env.GEOCONTEXT_LOG_LEVEL ?? "error",
    NODE_USE_ENV_PROXY: "1",
  };
  for (const proxyKey of [...PROXY_ENV_KEYS, ...NO_PROXY_ENV_KEYS]) {
    const value = process.env[proxyKey];
    if (value) env[proxyKey] = value;
  }

  const child: ChildProcess = spawn(
    process.execPath,
    [resolve(process.cwd(), process.env.GEOCONTEXT_PROXY_PATH ?? "dist/proxy/index.js")],
    { env, stdio: "ignore" },
  );

  const baseUrl = `http://${HOST}:${PROXY_PORT}`;

  // Poll the endpoint until it answers (any HTTP status means it is listening).
  // A bare GET with no `q` returns 400 once the proxy is up.
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error("Proxy server did not start within 30s");
    }
    try {
      await fetch(`${baseUrl}${ENDPOINT}`);
      break; // any response = listening
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const cleanup = async () => {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    if (!child.killed) child.kill("SIGKILL");
  };

  return { baseUrl, endpoint: ENDPOINT, key, cleanup };
}
